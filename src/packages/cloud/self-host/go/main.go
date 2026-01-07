// MIT-licensed. This file (and all files in this directory) are MIT licensed.
// See LICENSE in this directory. This license does not apply elsewhere.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	defaultPollSeconds      = 10
	defaultFastPollSeconds  = 3
	defaultPollBoostSeconds = 60
	defaultTimeout          = 20 * time.Second
	defaultImage            = "24.04"
)

var version = "0.0.0"

type Config struct {
	BaseURL            string `json:"base_url"`
	ConnectorID        string `json:"connector_id,omitempty"`
	ConnectorToken     string `json:"connector_token,omitempty"`
	PollIntervalSeconds int    `json:"poll_interval_seconds,omitempty"`
	Name               string `json:"name,omitempty"`
}

type CommandEnvelope struct {
	ID       string                 `json:"id"`
	Action   string                 `json:"action"`
	Payload  map[string]interface{} `json:"payload"`
	IssuedAt string                 `json:"issued_at,omitempty"`
}

type State struct {
	Instances map[string]InstanceState `json:"instances"`
}

type InstanceState struct {
	Name      string   `json:"name"`
	Image     string   `json:"image,omitempty"`
	CreatedAt string   `json:"created_at,omitempty"`
	LastState string   `json:"last_state,omitempty"`
	LastIPv4  []string `json:"last_ipv4,omitempty"`
}

type multipassResult struct {
	Stdout string
	Stderr string
	Code   int
}

func main() {
	applyEnvVersion()
	if len(os.Args) < 2 {
		printHelp()
		os.Exit(1)
	}
	switch os.Args[1] {
	case "-h", "--help", "help":
		printHelp()
		return
	case "-v", "--version", "version":
		fmt.Println(version)
		return
	case "pair":
		runPair(os.Args[2:])
		return
	case "run":
		runLoopCmd(os.Args[2:])
		return
	case "stop":
		stopDaemonCmd(os.Args[2:])
		return
	case "once":
		runOnceCmd(os.Args[2:])
		return
	default:
		printHelp()
		os.Exit(1)
	}
}

func applyEnvVersion() {
	if v := os.Getenv("COCALC_SELF_HOST_CONNECTOR_VERSION"); v != "" {
		version = v
	}
}

func runPair(args []string) {
	fs := flag.NewFlagSet("pair", flag.ExitOnError)
	baseURL := fs.String("base-url", "", "CoCalc base URL (e.g. https://dev.cocalc.ai)")
	urlAlias := fs.String("url", "", "Alias for --base-url")
	token := fs.String("token", "", "Pairing token")
	name := fs.String("name", "", "Connector name")
	replace := fs.Bool("replace", false, "Replace existing config if present")
	cfgPath := fs.String("config", "", "Config path")
	fs.Parse(args)

	if *baseURL == "" {
		*baseURL = *urlAlias
	}
	if *baseURL == "" || *token == "" {
		fail("pair requires --base-url and --token")
	}
	path := configPath(*cfgPath)
	if fileExists(path) && !*replace {
		fail(fmt.Sprintf(
			"connector config already exists at %s\n\nTo replace it, run:\n  cocalc-self-host-connector pair --replace --base-url %s --token <pairing_token>\n",
			path,
			*baseURL,
		))
	}
	info := map[string]interface{}{
		"name":        *name,
		"version":     version,
		"os":          runtime.GOOS,
		"arch":        runtime.GOARCH,
		"capabilities": map[string]bool{"multipass": true},
	}
	payload := map[string]interface{}{
		"pairing_token": *token,
		"connector_info": info,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		fail(fmt.Sprintf("pair payload: %v", err))
	}
	endpoint := normalizeBaseURL(*baseURL) + "/self-host/pair"
	respBody, status, err := httpRequest("POST", endpoint, "", "application/json", body)
	if err != nil {
		fail(fmt.Sprintf("pair request failed: %v", err))
	}
	if status < 200 || status >= 300 {
		fail(fmt.Sprintf("pair failed (%d): %s", status, string(respBody)))
	}
	var resp struct {
		ConnectorID        string `json:"connector_id"`
		ConnectorToken     string `json:"connector_token"`
		PollIntervalSeconds int    `json:"poll_interval_seconds"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		fail(fmt.Sprintf("pair response decode: %v", err))
	}
	cfg := Config{
		BaseURL:            *baseURL,
		ConnectorID:        resp.ConnectorID,
		ConnectorToken:     resp.ConnectorToken,
		PollIntervalSeconds: resp.PollIntervalSeconds,
		Name:               *name,
	}
	saveJSON(path, cfg)
	logLine("paired connector", map[string]interface{}{
		"connector_id": resp.ConnectorID,
		"config":       path,
	})
}

func runLoopCmd(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	cfgPath := fs.String("config", "", "Config path")
	daemon := fs.Bool("daemon", false, "Run in background (daemon mode)")
	fs.Parse(args)
	path := configPath(*cfgPath)
	if *daemon {
		if err := startDaemon(path); err != nil {
			fail(err.Error())
		}
		return
	}
	cfg := loadConfig(path)

	if err := ensureMultipassAvailable(); err != nil {
		fail(err.Error())
	}
	runLoop(cfg, path)
}

func runOnceCmd(args []string) {
	fs := flag.NewFlagSet("once", flag.ExitOnError)
	cfgPath := fs.String("config", "", "Config path")
	fs.Parse(args)
	path := configPath(*cfgPath)
	cfg := loadConfig(path)
	statePath := statePathFromConfig(path)
	state := loadState(statePath)
	_, _ = pollOnce(cfg, state, statePath)
}

func stopDaemonCmd(args []string) {
	fs := flag.NewFlagSet("stop", flag.ExitOnError)
	cfgPath := fs.String("config", "", "Config path")
	fs.Parse(args)
	path := configPath(*cfgPath)
	if err := stopDaemon(path); err != nil {
		fail(err.Error())
	}
}

func printHelp() {
	fmt.Println(`Usage:
  cocalc-self-host-connector pair --base-url <url> --token <pairing_token> [--name <name>] [--replace]
  cocalc-self-host-connector run [--config <path>] [--daemon]
  cocalc-self-host-connector stop [--config <path>]
  cocalc-self-host-connector once [--config <path>]
`)
}

func configPath(override string) string {
	if override != "" {
		return override
	}
	base := os.Getenv("XDG_CONFIG_HOME")
	if base == "" {
		base = filepath.Join(userHomeDir(), ".config")
	}
	return filepath.Join(base, "cocalc-connector", "config.json")
}

func statePathFromConfig(cfgPath string) string {
	return filepath.Join(filepath.Dir(cfgPath), "state.json")
}

func startDaemon(cfgPath string) error {
	cfgDir := filepath.Dir(cfgPath)
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}
	pidPath := filepath.Join(cfgDir, "daemon.pid")
	logPath := filepath.Join(cfgDir, "daemon.log")

	if fileExists(pidPath) {
		data, _ := os.ReadFile(pidPath)
		if pid, err := parsePID(string(data)); err == nil {
			if processAlive(pid) {
				return fmt.Errorf("connector daemon already running (pid %d)", pid)
			}
		}
		_ = os.Remove(pidPath)
	}

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to locate executable: %w", err)
	}
	args := []string{"run", "--config", cfgPath}
	cmd := exec.Command(exe, args...)
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer logFile.Close()
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Stdin = nil
	if runtime.GOOS != "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start daemon: %w", err)
	}
	_ = cmd.Process.Release()
	if err := os.WriteFile(pidPath, []byte(fmt.Sprintf("%d\n", cmd.Process.Pid)), 0o600); err != nil {
		return fmt.Errorf("failed to write pid file: %w", err)
	}
	logLine("daemon started", map[string]interface{}{
		"pid": cmd.Process.Pid,
		"log": logPath,
	})
	return nil
}

func stopDaemon(cfgPath string) error {
	pidPath := filepath.Join(filepath.Dir(cfgPath), "daemon.pid")
	if !fileExists(pidPath) {
		return fmt.Errorf("connector daemon not running (missing %s)", pidPath)
	}
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return fmt.Errorf("failed to read pid file: %w", err)
	}
	pid, err := parsePID(string(data))
	if err != nil {
		return fmt.Errorf("invalid pid file: %w", err)
	}
	if !processAlive(pid) {
		_ = os.Remove(pidPath)
		return fmt.Errorf("connector daemon not running (stale pid %d)", pid)
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to stop daemon: %w", err)
	}
	time.Sleep(200 * time.Millisecond)
	if !processAlive(pid) {
		_ = os.Remove(pidPath)
		logLine("daemon stopped", map[string]interface{}{"pid": pid})
		return nil
	}
	return fmt.Errorf("daemon did not exit (pid %d)", pid)
}

func loadConfig(path string) Config {
	cfg := Config{}
	if !readJSON(path, &cfg) {
		cfg.BaseURL = ""
	}
	return cfg
}

func loadState(path string) State {
	state := State{Instances: map[string]InstanceState{}}
	if !readJSON(path, &state) {
		state.Instances = map[string]InstanceState{}
	}
	return state
}

func saveState(path string, state State) {
	saveJSON(path, state)
}

func readJSON(path string, dest interface{}) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	if err := json.Unmarshal(data, dest); err != nil {
		return false
	}
	return true
}

func saveJSON(path string, data interface{}) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail(fmt.Sprintf("mkdir %s: %v", dir, err))
	}
	blob, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fail(fmt.Sprintf("encode json: %v", err))
	}
	if err := os.WriteFile(path, blob, 0o600); err != nil {
		fail(fmt.Sprintf("write %s: %v", path, err))
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func parsePID(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, errors.New("empty pid")
	}
	var pid int
	_, err := fmt.Sscanf(raw, "%d", &pid)
	if err != nil {
		return 0, err
	}
	return pid, nil
}

func processAlive(pid int) bool {
	if pid <= 1 {
		return false
	}
	return syscall.Kill(pid, 0) == nil
}

func normalizeBaseURL(raw string) string {
	return strings.TrimRight(raw, "/")
}

func pollOnce(cfg Config, state State, statePath string) (bool, error) {
	base := normalizeBaseURL(cfg.BaseURL)
	if base == "" {
		return false, errors.New("base_url missing in config")
	}
	if cfg.ConnectorToken == "" {
		return false, errors.New("connector_token missing in config")
	}
	body, status, err := httpRequest("GET", base+"/self-host/next", cfg.ConnectorToken, "", nil)
	if err != nil {
		return false, err
	}
	if status == http.StatusNoContent {
		return false, nil
	}
	if status < 200 || status >= 300 {
		return false, fmt.Errorf("poll failed (%d): %s", status, string(body))
	}
	var cmd CommandEnvelope
	if err := json.Unmarshal(body, &cmd); err != nil {
		return false, fmt.Errorf("poll decode: %v", err)
	}
	logLine("command received", map[string]interface{}{"id": cmd.ID, "action": cmd.Action})
	statusStr := "ok"
	var result interface{}
	var errMsg string
	if res, err := executeCommand(cmd, state, statePath); err != nil {
		statusStr = "error"
		errMsg = err.Error()
	} else {
		result = res
	}
	logLine("command finished", map[string]interface{}{"id": cmd.ID, "action": cmd.Action, "status": statusStr, "error": errMsg})
	ackPayload := map[string]interface{}{
		"id":     cmd.ID,
		"status": statusStr,
		"result": result,
		"error":  errMsg,
	}
	ackBody, _ := json.Marshal(ackPayload)
	_, ackStatus, _ := httpRequest("POST", base+"/self-host/ack", cfg.ConnectorToken, "application/json", ackBody)
	if ackStatus < 200 || ackStatus >= 300 {
		logLine("ack failed", map[string]interface{}{"id": cmd.ID, "status": ackStatus})
	}
	return true, nil
}

func runLoop(cfg Config, cfgPath string) {
	if cfg.BaseURL == "" || cfg.ConnectorToken == "" {
		fail("connector config missing base_url or connector_token (run pair first)")
	}
	statePath := statePathFromConfig(cfgPath)
	state := loadState(statePath)
	baseInterval := cfg.PollIntervalSeconds
	if baseInterval <= 0 {
		baseInterval = defaultPollSeconds
	}
	fastInterval := min(baseInterval, defaultFastPollSeconds)
	if fastInterval <= 0 {
		fastInterval = baseInterval
	}
	boostWindow := time.Duration(defaultPollBoostSeconds) * time.Second
	boostUntil := time.Now().Add(boostWindow)
	idlePolls := 0
	lastNoCommandLog := time.Now()
	logLine("connector started", map[string]interface{}{
		"base_url":           cfg.BaseURL,
		"poll_seconds":       baseInterval,
		"fast_poll_seconds":  fastInterval,
		"poll_boost_seconds": defaultPollBoostSeconds,
	})
	for {
		interval := baseInterval
		if time.Now().Before(boostUntil) {
			interval = fastInterval
		}
		hadCommand := false
		if ok, err := pollOnce(cfg, state, statePath); err != nil {
			logLine("poll error", map[string]interface{}{"error": err.Error()})
			boostUntil = time.Now().Add(boostWindow)
		} else {
			hadCommand = ok
		}
		if hadCommand {
			idlePolls = 0
			boostUntil = time.Now().Add(boostWindow)
		} else {
			idlePolls++
			if time.Since(lastNoCommandLog) >= time.Minute {
				logLine("poll ok (no commands)", nil)
				lastNoCommandLog = time.Now()
			}
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
}

func executeCommand(cmd CommandEnvelope, state State, statePath string) (interface{}, error) {
	switch cmd.Action {
	case "create":
		return handleCreate(cmd.Payload, state, statePath)
	case "start":
		return handleStart(cmd.Payload, state)
	case "stop":
		return handleStop(cmd.Payload, state)
	case "delete":
		return handleDelete(cmd.Payload, state, statePath)
	case "status":
		return handleStatus(cmd.Payload, state, statePath)
	case "resize":
		return handleResize(cmd.Payload, state)
	default:
		return nil, fmt.Errorf("unknown action %s", cmd.Action)
	}
}

func handleCreate(payload map[string]interface{}, state State, statePath string) (interface{}, error) {
	hostID := toString(payload["host_id"])
	if hostID == "" {
		return nil, errors.New("create requires host_id")
	}
	name := toString(payload["name"])
	if name == "" {
		name = "cocalc-" + hostID
	}
	image := toString(payload["image"])
	if image == "" {
		image = defaultImage
	}
	cpus := toNumberString(payload["cpus"])
	if cpus == "" {
		cpus = toNumberString(payload["vcpus"])
	}
	mem := formatSize(payload["mem_gb"], payload["memory_gb"], payload["memory"])
	disk := formatSize(payload["disk_gb"], payload["disk"], nil)
	cloudInit := payload["cloud_init"]
	if cloudInit == nil {
		cloudInit = payload["cloud_init_yaml"]
	}

	info := multipassInfo(name)
	if info.Exists {
		state.Instances[hostID] = InstanceState{
			Name:      name,
			Image:     image,
			LastState: info.State,
			LastIPv4:  info.IPv4,
		}
		saveState(statePath, state)
		return map[string]interface{}{"name": name, "state": info.State, "ipv4": info.IPv4}, nil
	}

	args := []string{"launch", "--name", name}
	if cpus != "" {
		args = append(args, "--cpus", cpus)
	}
	if mem != "" {
		args = append(args, "--memory", mem)
	}
	if disk != "" {
		args = append(args, "--disk", disk)
	}

	var initPaths *cloudInitPaths
	if cloudInit != nil {
		paths := createCloudInitPaths(hostID)
		initPaths = &paths
		if err := os.MkdirAll(paths.InitDir, 0o700); err != nil {
			return nil, fmt.Errorf("cloud-init mkdir: %v", err)
		}
		raw := toString(cloudInit)
		trimmed := strings.TrimLeft(raw, " \t\r\n")
		kind := "raw"
		contents := raw
		if !strings.HasPrefix(trimmed, "#cloud-config") {
			if strings.HasPrefix(trimmed, "#!") {
				kind = "wrapped-script"
			} else {
				kind = "wrapped"
			}
			contents = wrapCloudInitScript(raw)
		} else {
			kind = "cloud-config"
		}
		if err := os.WriteFile(paths.InitPath, []byte(contents), 0o600); err != nil {
			return nil, fmt.Errorf("cloud-init write: %v", err)
		}
		stat, _ := os.Stat(paths.InitPath)
		logLine("cloud-init written", map[string]interface{}{
			"path": paths.InitPath,
			"size": stat.Size(),
			"mode": fmt.Sprintf("%o", stat.Mode().Perm()),
			"kind": kind,
		})
		args = append(args, "--cloud-init", paths.InitPath)
	}
	args = append(args, image)

	result := runMultipass(args)
	if initPaths != nil && result.Code == 0 {
		cleanupCloudInit(*initPaths)
	}
	if result.Code != 0 {
		return nil, errors.New(strings.TrimSpace(result.Stderr))
	}

	info = multipassInfo(name)
	state.Instances[hostID] = InstanceState{
		Name:      name,
		Image:     image,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		LastState: info.State,
		LastIPv4:  info.IPv4,
	}
	saveState(statePath, state)
	return map[string]interface{}{"name": name, "state": info.State, "ipv4": info.IPv4}, nil
}

func handleStart(payload map[string]interface{}, state State) (interface{}, error) {
	hostID := toString(payload["host_id"])
	name := toString(payload["name"])
	if name == "" && hostID != "" {
		name = state.Instances[hostID].Name
	}
	if name == "" {
		return nil, errors.New("start requires host_id or name")
	}
	info := multipassInfo(name)
	if !info.Exists {
		return map[string]interface{}{"name": name, "state": "not_found"}, nil
	}
	result := runMultipass([]string{"start", name})
	if result.Code != 0 {
		return nil, errors.New(strings.TrimSpace(result.Stderr))
	}
	ref := multipassInfo(name)
	return map[string]interface{}{"name": name, "state": ref.State, "ipv4": ref.IPv4}, nil
}

func handleStop(payload map[string]interface{}, state State) (interface{}, error) {
	hostID := toString(payload["host_id"])
	name := toString(payload["name"])
	if name == "" && hostID != "" {
		name = state.Instances[hostID].Name
	}
	if name == "" {
		return nil, errors.New("stop requires host_id or name")
	}
	info := multipassInfo(name)
	if !info.Exists {
		return map[string]interface{}{"name": name, "state": "not_found"}, nil
	}
	result := runMultipass([]string{"stop", name})
	if result.Code != 0 {
		return nil, errors.New(strings.TrimSpace(result.Stderr))
	}
	ref := multipassInfo(name)
	return map[string]interface{}{"name": name, "state": ref.State, "ipv4": ref.IPv4}, nil
}

func handleDelete(payload map[string]interface{}, state State, statePath string) (interface{}, error) {
	hostID := toString(payload["host_id"])
	name := toString(payload["name"])
	if name == "" && hostID != "" {
		name = state.Instances[hostID].Name
	}
	if name == "" {
		return nil, errors.New("delete requires host_id or name")
	}
	runMultipass([]string{"delete", name})
	runMultipass([]string{"purge"})
	if hostID != "" {
		delete(state.Instances, hostID)
		saveState(statePath, state)
	}
	return map[string]interface{}{"name": name, "state": "deleted"}, nil
}

func handleStatus(payload map[string]interface{}, state State, statePath string) (interface{}, error) {
	hostID := toString(payload["host_id"])
	name := toString(payload["name"])
	if name == "" && hostID != "" {
		name = state.Instances[hostID].Name
	}
	if name == "" {
		return nil, errors.New("status requires host_id or name")
	}
	info := multipassInfo(name)
	if !info.Exists {
		return map[string]interface{}{"name": name, "state": "not_found"}, nil
	}
	if hostID != "" {
		state.Instances[hostID] = InstanceState{
			Name:      name,
			LastState: info.State,
			LastIPv4:  info.IPv4,
		}
		saveState(statePath, state)
	}
	return map[string]interface{}{"name": name, "state": info.State, "ipv4": info.IPv4}, nil
}

func handleResize(payload map[string]interface{}, state State) (interface{}, error) {
	hostID := toString(payload["host_id"])
	name := toString(payload["name"])
	if name == "" && hostID != "" {
		name = state.Instances[hostID].Name
	}
	if name == "" {
		return nil, errors.New("resize requires host_id or name")
	}
	info := multipassInfo(name)
	if !info.Exists {
		return map[string]interface{}{"name": name, "state": "not_found"}, nil
	}
	cpus := toNumberString(payload["cpus"])
	mem := formatSize(payload["mem_gb"], payload["memory_gb"], payload["memory"])
	disk := formatSize(payload["disk_gb"], payload["disk"], nil)
	diskGB := parseSizeGB(payload["disk_gb"], payload["disk"])
	if cpus == "" && mem == "" && disk == "" {
		return map[string]interface{}{"name": name, "state": info.State, "ipv4": info.IPv4}, nil
	}
	wasRunning := strings.ToLower(info.State) == "running"
	if wasRunning {
		res := runMultipass([]string{"stop", name})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
	}
	if cpus != "" {
		res := runMultipass([]string{"set", fmt.Sprintf("local.%s.cpus=%s", name, cpus)})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
	}
	if mem != "" {
		res := runMultipass([]string{"set", fmt.Sprintf("local.%s.memory=%s", name, mem)})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
	}
	if disk != "" {
		res := runMultipass([]string{"set", fmt.Sprintf("local.%s.disk=%s", name, disk)})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
	}
	needsGrow := diskGB > 0
	started := false
	if wasRunning || needsGrow {
		res := runMultipass([]string{"start", name})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
		started = true
	}
	if needsGrow && started {
		res := runMultipass([]string{"exec", name, "--", "sudo", "/usr/local/sbin/cocalc-grow-btrfs", fmt.Sprintf("%d", diskGB)})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
	}
	if !wasRunning && started {
		res := runMultipass([]string{"stop", name})
		if res.Code != 0 {
			return nil, errors.New(strings.TrimSpace(res.Stderr))
		}
	}
	ref := multipassInfo(name)
	return map[string]interface{}{"name": name, "state": ref.State, "ipv4": ref.IPv4}, nil
}

func runMultipass(args []string) multipassResult {
	logLine("multipass exec", map[string]interface{}{"command": formatCommand("multipass", args)})
	cmd := exec.Command("multipass", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if err != nil {
		if exitErr := new(exec.ExitError); errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			code = 1
		}
	}
	return multipassResult{
		Stdout: stdout.String(),
		Stderr: stderr.String(),
		Code:   code,
	}
}

type multipassInfoResult struct {
	Exists bool
	State  string
	IPv4   []string
}

func multipassInfo(name string) multipassInfoResult {
	res := runMultipass([]string{"info", name, "--format", "json"})
	if res.Code != 0 {
		return multipassInfoResult{Exists: false}
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(res.Stdout), &parsed); err != nil {
		return multipassInfoResult{Exists: false}
	}
	infoAny, ok := parsed["info"]
	if !ok {
		return multipassInfoResult{Exists: true}
	}
	info, ok := infoAny.(map[string]interface{})
	if !ok {
		return multipassInfoResult{Exists: true}
	}
	var entry map[string]interface{}
	if v, ok := info[name]; ok {
		entry, _ = v.(map[string]interface{})
	} else {
		for _, val := range info {
			if m, ok := val.(map[string]interface{}); ok {
				entry = m
				break
			}
		}
	}
	if entry == nil {
		return multipassInfoResult{Exists: true}
	}
	state := toString(entry["state"])
	ipv4 := toStringSlice(entry["ipv4"])
	return multipassInfoResult{Exists: true, State: state, IPv4: ipv4}
}

func ensureMultipassAvailable() error {
	res := runMultipass([]string{"version"})
	if res.Code != 0 {
		return errors.New("Ubuntu Multipass not found or not working; install multipass first:\n\n    https://canonical.com/multipass\n")
	}
	return nil
}

func wrapCloudInitScript(script string) string {
	trimmed := strings.TrimRight(script, " \t\r\n")
	indent := indentBlock(trimmed, 6)
	return fmt.Sprintf(`#cloud-config
write_files:
  - path: /root/cocalc-bootstrap.sh
    permissions: "0700"
    owner: root:root
    content: |
%s
runcmd:
  - [ "/bin/bash", "/root/cocalc-bootstrap.sh" ]
`, indent)
}

func indentBlock(text string, spaces int) string {
	prefix := strings.Repeat(" ", spaces)
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = prefix + line
	}
	return strings.Join(lines, "\n")
}

type cloudInitPaths struct {
	InitDir string
	InitPath string
	BaseDir string
	RootDir string
}

func createCloudInitPaths(hostID string) cloudInitPaths {
	base := cloudInitBaseDir()
	suffix := hostID + "-" + randomSuffix()
	initDir := filepath.Join(base, suffix)
	initPath := filepath.Join(initDir, "cloud-init.yml")
	root := ""
	if os.Getenv("COCALC_CONNECTOR_CLOUD_INIT_DIR") == "" {
		root = filepath.Dir(base)
	}
	return cloudInitPaths{
		InitDir: initDir,
		InitPath: initPath,
		BaseDir: base,
		RootDir: root,
	}
}

func cleanupCloudInit(paths cloudInitPaths) {
	_ = os.Remove(paths.InitPath)
	_ = os.Remove(paths.InitDir)
	cleanupDirIfEmpty(paths.BaseDir)
	if paths.RootDir != "" {
		cleanupDirIfEmpty(paths.RootDir)
	}
}

func cleanupDirIfEmpty(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	if len(entries) == 0 {
		_ = os.Remove(dir)
	}
}

func cloudInitBaseDir() string {
	if override := os.Getenv("COCALC_CONNECTOR_CLOUD_INIT_DIR"); override != "" {
		return override
	}
	home := userHomeDir()
	return filepath.Join(home, "cocalc-connector", "cloud-init")
}

func httpRequest(method, url, token, contentType string, body []byte) ([]byte, int, error) {
	client := &http.Client{Timeout: defaultTimeout}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(context.Background(), method, url, reader)
	if err != nil {
		return nil, 0, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return data, resp.StatusCode, nil
}

func parseSizeGB(primary, secondary interface{}) int {
	if v, ok := toInt(primary); ok {
		return v
	}
	if v, ok := toInt(secondary); ok {
		return v
	}
	return 0
}

func formatSize(primary, secondary, tertiary interface{}) string {
	if s := toString(primary); s != "" {
		return s
	}
	if s := toString(secondary); s != "" {
		return s
	}
	if s := toString(tertiary); s != "" {
		return s
	}
	return ""
}

func toInt(val interface{}) (int, bool) {
	switch v := val.(type) {
	case int:
		return v, v > 0
	case int64:
		return int(v), v > 0
	case float64:
		if v <= 0 {
			return 0, false
		}
		return int(math.Floor(v)), true
	case float32:
		if v <= 0 {
			return 0, false
		}
		return int(math.Floor(float64(v))), true
	case string:
		s := strings.TrimSpace(strings.ToLower(v))
		s = strings.TrimSuffix(s, "gb")
		s = strings.TrimSuffix(s, "g")
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil || f <= 0 {
			return 0, false
		}
		return int(math.Floor(f)), true
	}
	return 0, false
}

func toString(val interface{}) string {
	switch v := val.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	case float64:
		return fmt.Sprintf("%gG", v)
	case float32:
		return fmt.Sprintf("%gG", v)
	case int:
		return fmt.Sprintf("%dG", v)
	case int64:
		return fmt.Sprintf("%dG", v)
	}
	return ""
}

func toNumberString(val interface{}) string {
	switch v := val.(type) {
	case string:
		return v
	case float64:
		return fmt.Sprintf("%g", v)
	case float32:
		return fmt.Sprintf("%g", v)
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	default:
		return ""
	}
}

func toStringSlice(val interface{}) []string {
	switch v := val.(type) {
	case []string:
		return v
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, toString(item))
		}
		return out
	default:
		return nil
	}
}

func formatCommand(cmd string, args []string) string {
	parts := []string{cmd}
	for _, arg := range args {
		parts = append(parts, shellEscape(arg))
	}
	return strings.Join(parts, " ")
}

func shellEscape(value string) string {
	if value == "" {
		return "''"
	}
	if strings.IndexFunc(value, func(r rune) bool {
		return !(r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || strings.ContainsRune("_./:=,@+-", r))
	}) == -1 {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func logLine(message string, data map[string]interface{}) {
	ts := time.Now().UTC().Format(time.RFC3339)
	if data == nil {
		fmt.Printf("%s %s\n", ts, message)
		return
	}
	payload, _ := json.Marshal(data)
	fmt.Printf("%s %s %s\n", ts, message, string(payload))
}

func randomSuffix() string {
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	return time.Now().Format("20060102-150405") + "-" + hex.EncodeToString(buf)
}

func userHomeDir() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return home
	}
	return "."
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
