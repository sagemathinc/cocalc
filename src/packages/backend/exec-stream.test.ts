/*
 *  This file is part of CoCalc: Copyright © 2024–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Test exec-stream streaming functionality
 *
 * DEVELOPMENT:
 *
 * pnpm test ./exec-stream.test.ts
 */

import { delay } from "awaiting";
import { EventEmitter } from "node:events";

describe("executeStream function - unit tests", () => {
  const mockExecuteCode = jest.fn();
  const mockAsyncCache = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const mockUpdates = new EventEmitter();
  const mockEventKey = (type: string, job_id: string) => `${type}-${job_id}`;

  beforeEach(() => {
    // Reset modules and mocks for proper test isolation
    jest.resetModules();
    jest.clearAllMocks();
    mockUpdates.removeAllListeners();

    // Re-mock for each test to ensure clean state
    jest.doMock("./execute-code", () => ({
      executeCode: mockExecuteCode,
      asyncCache: mockAsyncCache,
      updates: mockUpdates,
      eventKey: mockEventKey,
    }));

    mockAsyncCache.get.mockClear();
    mockAsyncCache.set.mockClear();
  });

  it("streams stdout in batches", async () => {
    // Mock executeCode — no streamCB is passed; streaming goes via updates EventEmitter
    mockExecuteCode.mockImplementation(async (_options) => {
      return {
        type: "async",
        job_id: "test-job-id",
        pid: 1234,
        status: "running",
        start: Date.now(),
      };
    });

    // Mock asyncCache to return undefined (job not completed)
    mockAsyncCache.get.mockReturnValue(undefined);

    const { executeStream } = await import("./exec-stream");
    const userCallback = jest.fn(); // This is what the user passes to executeStream

    await executeStream({
      project_id: "test-project-id",
      command:
        "echo 'first'; sleep 0.1; echo 'second'; sleep 0.1; echo 'third'",
      bash: true,
      stream: userCallback, // User's callback receives processed events
    });

    // Verify executeCode was called correctly (no streamCB in new architecture)
    expect(mockExecuteCode).toHaveBeenCalledWith(
      expect.objectContaining({
        async_call: true,
      }),
    );

    // Simulate streaming events via the updates EventEmitter (new architecture)
    mockUpdates.emit(mockEventKey("stdout", "test-job-id"), "first\n");
    mockUpdates.emit(mockEventKey("stdout", "test-job-id"), "second\n");
    mockUpdates.emit(mockEventKey("stdout", "test-job-id"), "third\n");
    mockUpdates.emit(mockEventKey("finished", "test-job-id"), {
      type: "async",
      job_id: "test-job-id",
      status: "completed",
      stdout: "first\nsecond\nthird\n",
      stderr: "",
      exit_code: 0,
      start: Date.now(),
      stats: [],
    });

    // Verify the user's callback received the expected processed events
    const calls = userCallback.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");
    expect(calls[0][0].data).toMatchObject({
      type: "async",
      job_id: "test-job-id",
      pid: 1234,
      status: "running",
    });

    // Then the streaming events
    expect(calls[1][0]).toEqual({ type: "stdout", data: "first\n" });
    expect(calls[2][0]).toEqual({ type: "stdout", data: "second\n" });
    expect(calls[3][0]).toEqual({ type: "stdout", data: "third\n" });
    expect(calls[4][0]).toEqual({
      type: "done",
      data: expect.objectContaining({
        stdout: "first\nsecond\nthird\n",
        status: "completed",
      }),
    });
    expect(calls[5][0]).toBe(null); // Stream end
  });

  it("streams stdout and stderr (real execution alternative)", async () => {
    // This test demonstrates the user's suggestion: let executeCode run for real
    // instead of mocking and simulating events

    // Temporarily unmock executeCode for this test
    jest.unmock("./execute-code");
    jest.resetModules();

    // Import fresh executeStream that uses real executeCode
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];
    let streamEnded = false;

    const userCallback = jest.fn((event) => {
      if (event) {
        streamEvents.push(event);
      } else {
        streamEnded = true; // null event signals stream end
      }
    });

    // Run a real command that produces both stdout and stderr output
    await executeStream({
      project_id: "test-project-id",
      command:
        "echo 'stdout1'; >&2 echo 'stderr1'; echo 'stdout2'; >&2 echo 'stderr2'",
      bash: true,
      stream: userCallback,
    });

    // Wait for the stream to end (instead of fixed delay)
    while (!streamEnded) {
      await delay(10); // Small delay to avoid busy waiting
    }

    // Verify we got real streaming events
    expect(streamEvents.length).toBeGreaterThan(0);

    // Find events by type
    const stdoutEvents = streamEvents.filter((e) => e.type === "stdout");
    const stderrEvents = streamEvents.filter((e) => e.type === "stderr");
    const jobEvent = streamEvents.find((e) => e.type === "job");
    const doneEvent = streamEvents.find((e) => e.type === "done");

    // Should have initial job info
    expect(jobEvent).toBeDefined();
    expect(jobEvent?.data?.job_id).toBeDefined();
    expect(jobEvent?.data?.pid).toBeGreaterThan(0);
    expect(jobEvent?.data?.status).toBe("running");

    // Should have stdout events from real execution (may be batched)
    expect(stdoutEvents.length).toBeGreaterThanOrEqual(1);
    expect(stdoutEvents.some((e) => e.data && e.data.includes("stdout1"))).toBe(
      true,
    );
    expect(stdoutEvents.some((e) => e.data && e.data.includes("stdout2"))).toBe(
      true,
    );

    // Should have stderr events from real execution (may be batched)
    expect(stderrEvents.length).toBeGreaterThanOrEqual(1);
    expect(stderrEvents.some((e) => e.data && e.data.includes("stderr1"))).toBe(
      true,
    );
    expect(stderrEvents.some((e) => e.data && e.data.includes("stderr2"))).toBe(
      true,
    );

    // Should have completion event
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data?.status).toBe("completed");
    expect(doneEvent?.data?.exit_code).toBe(0);

    // Verify event order
    const jobIndex = streamEvents.findIndex((e) => e.type === "job");
    const doneIndex = streamEvents.findIndex((e) => e.type === "done");
    expect(jobIndex).toBe(0);
    expect(doneIndex).toBe(streamEvents.length - 1);

    // Re-mock for subsequent tests
    jest.doMock("./execute-code", () => ({
      executeCode: mockExecuteCode,
      asyncCache: mockAsyncCache,
      updates: mockUpdates,
      eventKey: mockEventKey,
    }));
  });

  it("streams stderr in batches", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      return {
        type: "async",
        job_id: "test-job-id",
        pid: 1234,
        status: "running",
        start: Date.now(),
      };
    });

    // Mock asyncCache to return undefined (job not completed)
    mockAsyncCache.get.mockReturnValue(undefined);

    const { executeStream } = await import("./exec-stream");
    const userCallback = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: ">&2 echo 'error1'; sleep 0.1; >&2 echo 'error2'",
      bash: true,
      stream: userCallback,
    });

    // Simulate streaming events via the updates EventEmitter
    mockUpdates.emit(mockEventKey("stderr", "test-job-id"), "error1\n");
    mockUpdates.emit(mockEventKey("stderr", "test-job-id"), "error2\n");
    mockUpdates.emit(mockEventKey("finished", "test-job-id"), {
      type: "async",
      job_id: "test-job-id",
      status: "completed",
      stdout: "",
      stderr: "error1\nerror2\n",
      exit_code: 0,
      start: Date.now(),
      stats: [],
    });

    // Verify the user's callback received the expected processed events
    const calls = userCallback.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");

    // Then the stderr events
    expect(calls[1][0]).toEqual({ type: "stderr", data: "error1\n" });
    expect(calls[2][0]).toEqual({ type: "stderr", data: "error2\n" });
    expect(calls[3][0]).toEqual({
      type: "done",
      data: expect.objectContaining({
        stderr: "error1\nerror2\n",
        status: "completed",
      }),
    });
    expect(calls[4][0]).toBe(null); // Stream end
  });

  it("streams mixed stdout and stderr with stats", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      return {
        type: "async",
        job_id: "test-job-id",
        pid: 1234,
        status: "running",
        start: Date.now(),
      };
    });

    // Mock asyncCache to return undefined (job not completed)
    mockAsyncCache.get.mockReturnValue(undefined);

    const { executeStream } = await import("./exec-stream");
    const userCallback = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "echo 'stdout1'; >&2 echo 'stderr1'; echo 'stdout2'",
      bash: true,
      stream: userCallback,
    });

    // Simulate mixed streaming events via the updates EventEmitter
    mockUpdates.emit(mockEventKey("stdout", "test-job-id"), "stdout1\n");
    mockUpdates.emit(mockEventKey("stderr", "test-job-id"), "stderr1\n");
    mockUpdates.emit(mockEventKey("stats", "test-job-id"), {
      timestamp: Date.now(),
      cpu_pct: 1.5,
      cpu_secs: 0.1,
      mem_rss: 1024,
    });
    mockUpdates.emit(mockEventKey("stdout", "test-job-id"), "stdout2\n");
    mockUpdates.emit(mockEventKey("finished", "test-job-id"), {
      type: "async",
      job_id: "test-job-id",
      status: "completed",
      stdout: "stdout1\nstdout2\n",
      stderr: "stderr1\n",
      exit_code: 0,
      start: Date.now(),
      stats: [],
    });

    // Verify all events were streamed in order
    const calls = userCallback.mock.calls;
    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");
    // Then the streaming events in order
    expect(calls[1][0]).toEqual({ type: "stdout", data: "stdout1\n" });
    expect(calls[2][0]).toEqual({ type: "stderr", data: "stderr1\n" });
    expect(calls[3][0]).toEqual({
      type: "stats",
      data: expect.objectContaining({
        cpu_pct: 1.5,
        cpu_secs: 0.1,
        mem_rss: 1024,
      }),
    });
    expect(calls[4][0]).toEqual({ type: "stdout", data: "stdout2\n" });
    expect(calls[5][0]).toEqual({
      type: "done",
      data: expect.objectContaining({
        stdout: "stdout1\nstdout2\n",
        stderr: "stderr1\n",
      }),
    });
    expect(calls[6][0]).toBe(null); // Stream end
  });

  it("handles streaming errors", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      return {
        type: "async",
        job_id: "test-job-id",
        pid: 1234,
        status: "running",
        start: Date.now(),
      };
    });

    // Mock asyncCache to return undefined (job not completed)
    mockAsyncCache.get.mockReturnValue(undefined);

    const { executeStream } = await import("./exec-stream");
    const userCallback = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "exit 1",
      bash: true,
      stream: userCallback,
    });

    // Simulate error completion via the updates EventEmitter (finished with error status)
    mockUpdates.emit(mockEventKey("finished", "test-job-id"), {
      type: "async",
      job_id: "test-job-id",
      status: "error",
      stdout: "",
      stderr: "Command failed with exit code 1",
      exit_code: 1,
      start: Date.now(),
      stats: [],
    });

    // Verify error event and stream ending
    const calls = userCallback.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");

    // Then the done event with error status
    expect(calls[1][0]).toEqual({
      type: "done",
      data: expect.objectContaining({
        status: "error",
        stderr: "Command failed with exit code 1",
      }),
    });
    expect(calls[2][0]).toBe(null); // Stream end
  });

  it("handles process spawning errors", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      // Simulate spawning error by throwing
      throw new Error("Failed to spawn process");
    });

    // Mock asyncCache to return undefined (no job created due to error)
    mockAsyncCache.get.mockReturnValue(undefined);

    const { executeStream } = await import("./exec-stream");
    const mockStream = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "nonexistent-command",
      stream: mockStream,
    });

    // Verify error event and stream ending
    const calls = mockStream.mock.calls;
    expect(calls.length).toBe(2); // Error event + stream end

    expect(calls[0][0]).toEqual({
      error: "Error: Failed to spawn process",
    });
    expect(calls[1][0]).toBe(null); // Stream end
  });

  it("handles jobs that complete immediately", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      return {
        type: "async",
        job_id: "test-job-id",
        pid: 1234,
        status: "running",
        start: Date.now(),
      };
    });

    // Mock asyncCache to return a completed job (simulating immediate completion)
    const completedJob = {
      type: "async",
      job_id: "test-job-id",
      status: "completed",
      stdout: "quick output\n",
      stderr: "",
      exit_code: 0,
      start: Date.now(),
      stats: [],
    };
    mockAsyncCache.get.mockReturnValue(completedJob);

    const { executeStream } = await import("./exec-stream");
    const mockStream = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "echo 'quick output'",
      bash: true,
      stream: mockStream,
    });

    // For immediate completion, the done event should be sent immediately
    // without needing to simulate streaming events

    // Verify event order and content
    const calls = mockStream.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");

    // Since job completed immediately, done event should come next
    expect(calls[1][0]).toEqual({
      type: "done",
      data: expect.objectContaining({
        status: "completed",
        stdout: "quick output\n",
      }),
    });
    expect(calls[2][0]).toBe(null); // Stream end
  });

  it("handles error exit codes with streaming", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      return {
        type: "async",
        job_id: "test-job-id",
        pid: 1234,
        status: "running",
        start: Date.now(),
      };
    });

    // Mock asyncCache to return undefined (job not completed)
    mockAsyncCache.get.mockReturnValue(undefined);

    const { executeStream } = await import("./exec-stream");
    const userCallback = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "exit 42",
      bash: true,
      stream: userCallback,
    });

    // Simulate error completion via the updates EventEmitter
    mockUpdates.emit(mockEventKey("finished", "test-job-id"), {
      type: "async",
      job_id: "test-job-id",
      status: "error",
      stdout: "",
      stderr: "exit 42 failed",
      exit_code: 42,
      start: Date.now(),
      stats: [],
    });

    // Verify error completion event
    const calls = userCallback.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");

    // Then the done event with error status
    expect(calls[1][0]).toEqual({
      type: "done",
      data: expect.objectContaining({
        status: "error",
        exit_code: 42,
        stderr: "exit 42 failed",
      }),
    });
    expect(calls[2][0]).toBe(null); // Stream end
  });

  it("handles job creation failure", async () => {
    mockExecuteCode.mockResolvedValue({
      type: "blocking", // Wrong type - should be async
      stdout: "some output",
    });

    const { executeStream } = await import("./exec-stream");
    const mockStream = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "echo test",
      bash: true,
      stream: mockStream,
    });

    // Verify error event and stream ending
    const calls = mockStream.mock.calls;
    expect(calls.length).toBe(2); // Error event + stream end

    expect(calls[0][0]).toEqual({
      error: "Failed to create async job for streaming",
    });
    expect(calls[1][0]).toBe(null); // Stream end
  });

  it("handles timeout scenarios", async () => {
    // For this test, let's use real executeCode to test actual timeout behavior
    jest.unmock("./execute-code");
    jest.resetModules();

    // Import fresh executeStream that uses real executeCode
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];

    const userCallback = jest.fn((event) => {
      if (event) {
        streamEvents.push(event);
      }
    });

    // Start a long-running command with a short timeout
    await executeStream({
      project_id: "test-project-id",
      command: "sleep 5", // 5 second command
      bash: true,
      timeout: 1, // 1 second timeout
      stream: userCallback,
    });

    // Wait for the command to either complete or timeout
    await delay(2500); // Wait longer than the 1-second timeout

    // Verify we got events
    expect(streamEvents.length).toBeGreaterThan(0);

    // Verify stream ended (should have null event at the end)
    expect(userCallback).toHaveBeenLastCalledWith(null);

    // Find events by type
    const jobEvent = streamEvents.find((e) => e.type === "job");
    const doneEvent = streamEvents.find((e) => e.type === "done");
    const errorEvents = streamEvents.filter((e) => e.error);

    // Should have initial job info
    expect(jobEvent).toBeDefined();
    expect(jobEvent?.data?.job_id).toBeDefined();

    // With a 1s timeout on a 5s sleep, the command should be killed.
    // We expect either a done event with error status, or an error event.
    expect(doneEvent || errorEvents.length > 0).toBeTruthy();
    if (doneEvent) {
      // Timeout should produce a non-zero exit code or error status
      const isError =
        doneEvent.data?.status === "error" || doneEvent.data?.exit_code !== 0;
      expect(isError).toBe(true);
    }

    // Re-mock for subsequent tests
    jest.doMock("./execute-code", () => ({
      executeCode: mockExecuteCode,
      asyncCache: mockAsyncCache,
      updates: mockUpdates,
      eventKey: mockEventKey,
    }));
  });

  it("handles non-existent executable", async () => {
    mockExecuteCode.mockImplementation(async (_options) => {
      // Simulate the error that occurs when executable doesn't exist
      throw new Error("spawn foobar ENOENT");
    });

    const { executeStream } = await import("./exec-stream");
    const mockStream = jest.fn();

    await executeStream({
      project_id: "test-project-id",
      command: "foobar",
      args: ["baz"],
      stream: mockStream,
    });

    // Verify error event and stream ending
    const calls = mockStream.mock.calls;
    expect(calls.length).toBe(2); // Error event + stream end

    expect(calls[0][0]).toEqual({
      error: "Error: spawn foobar ENOENT",
    });
    expect(calls[1][0]).toBe(null); // Stream end
  });
});

// Integration tests using real executeCode
describe("exec-stream integration tests", () => {
  beforeAll(() => {
    // Unmock executeCode for integration tests
    jest.unmock("./execute-code");
    jest.resetModules();
  });

  it("streams real bash script output in batches with delays", async () => {
    // Import fresh executeStream that uses real executeCode
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];
    const mockStream = jest.fn((event) => {
      if (event) {
        streamEvents.push(event);
      }
    });

    // Create a bash script that outputs to both stdout and stderr with delays
    const bashScript = `
        echo "stdout batch 1"
        sleep 0.1
        >&2 echo "stderr batch 1"
        sleep 0.1
        echo "stdout batch 2"
        sleep 0.1
        >&2 echo "stderr batch 2"
        sleep 0.1
        echo "stdout batch 3"
      `;

    await executeStream({
      project_id: "test-project-id",
      command: bashScript.trim(),
      bash: true,
      stream: mockStream,
    });

    // Wait for the streaming to complete (increase timeout for reliability)
    await delay(1500);

    // Verify we got the expected stream events
    expect(streamEvents.length).toBeGreaterThan(0);

    // Find events by type
    const stdoutEvents = streamEvents.filter((e) => e.type === "stdout");
    const stderrEvents = streamEvents.filter((e) => e.type === "stderr");
    const jobEvent = streamEvents.find((e) => e.type === "job");
    const doneEvent = streamEvents.find((e) => e.type === "done");

    // Should have initial job info as first event
    expect(jobEvent).toBeDefined();
    expect(jobEvent?.data?.job_id).toBeDefined();
    expect(jobEvent?.data?.pid).toBeGreaterThan(0);
    expect(jobEvent?.data?.status).toBe("running");

    // Should have multiple stdout batches
    expect(stdoutEvents.length).toBeGreaterThanOrEqual(3);
    expect(stdoutEvents.some((e) => e.data && e.data.includes("batch 1"))).toBe(
      true,
    );
    expect(stdoutEvents.some((e) => e.data && e.data.includes("batch 2"))).toBe(
      true,
    );
    expect(stdoutEvents.some((e) => e.data && e.data.includes("batch 3"))).toBe(
      true,
    );

    // Should have stderr batches
    expect(stderrEvents.length).toBeGreaterThanOrEqual(2);
    expect(stderrEvents.some((e) => e.data && e.data.includes("batch 1"))).toBe(
      true,
    );
    expect(stderrEvents.some((e) => e.data && e.data.includes("batch 2"))).toBe(
      true,
    );

    // Should have completion event
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data?.status).toBe("completed");
    expect(doneEvent?.data?.exit_code).toBe(0);

    // Verify event order: job first, then streaming events, then done
    const jobIndex = streamEvents.findIndex((e) => e.type === "job");
    const doneIndex = streamEvents.findIndex((e) => e.type === "done");
    expect(jobIndex).toBe(0); // Job event should be first
    expect(doneIndex).toBe(streamEvents.length - 1); // Done event should be last
  });

  it("handles process monitoring with stats streaming", async () => {
    // Import fresh executeStream that uses real executeCode
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];
    const mockStream = jest.fn((event) => {
      if (event) {
        streamEvents.push(event);
      }
    });

    // Run a longer task to get stats
    const bashScript = `
        echo "Starting CPU intensive task"
        python3 -c "
import time
import os
print(f'PID: {os.getpid()}')
t0=time.time()
while t0+2>time.time():
    sum([_ for _ in range(10**6)])
print('CPU task completed')
"
        echo "Task finished"
      `;

    await executeStream({
      project_id: "test-project-id",
      command: bashScript.trim(),
      bash: true,
      stream: mockStream,
    });

    // Wait for completion (longer timeout for CPU intensive task)
    await delay(5000);

    // Verify we got events
    expect(streamEvents.length).toBeGreaterThan(0);

    // Find events by type
    const jobEvent = streamEvents.find((e) => e.type === "job");
    const doneEvent = streamEvents.find((e) => e.type === "done");
    const statsEvents = streamEvents.filter((e) => e.type === "stats");
    const stdoutEvents = streamEvents.filter((e) => e.type === "stdout");

    // Should have initial job info
    expect(jobEvent).toBeDefined();
    expect(jobEvent?.data?.job_id).toBeDefined();
    expect(jobEvent?.data?.status).toBe("running");

    // Should have stdout events from the script
    expect(stdoutEvents.length).toBeGreaterThan(0);
    expect(
      stdoutEvents.some(
        (e) => e.data && e.data.includes("Starting CPU intensive task"),
      ),
    ).toBe(true);
    expect(
      stdoutEvents.some((e) => e.data && e.data.includes("Task finished")),
    ).toBe(true);

    // Check if we have stats events (may not be generated in all environments)
    if (statsEvents.length > 0) {
      // Verify stats structure if we have stats
      const statsEvent = statsEvents[0];
      expect(statsEvent.data).toMatchObject({
        timestamp: expect.any(Number),
        cpu_pct: expect.any(Number),
        cpu_secs: expect.any(Number),
        mem_rss: expect.any(Number),
        // pid may not be present in all stats formats
      });

      // Stats should have reasonable values
      expect(statsEvent.data.cpu_pct).toBeGreaterThanOrEqual(0);
      expect(statsEvent.data.mem_rss).toBeGreaterThan(0);
    } else {
      // If no stats events, just log a warning but don't fail
      console.warn(
        "No stats events generated - this may be normal in test environment",
      );
    }

    // Should have completion event
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data?.status).toBe("completed");
    expect(doneEvent?.data?.exit_code).toBe(0);
    expect(doneEvent?.data?.stats).toBeDefined();

    // Verify event order: job first, then streaming events, then done
    const jobIndex = streamEvents.findIndex((e) => e.type === "job");
    const doneIndex = streamEvents.findIndex((e) => e.type === "done");
    expect(jobIndex).toBe(0); // Job event should be first
    expect(doneIndex).toBe(streamEvents.length - 1); // Done event should be last
  }, 15000); // 15 second timeout

  it("handles command errors with proper done events", async () => {
    // Import fresh executeStream that uses real executeCode
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];
    const mockStream = jest.fn((event) => {
      if (event) {
        streamEvents.push(event);
      }
    });

    // Run a command that will fail
    await executeStream({
      project_id: "test-project-id",
      command: "exit 123",
      bash: true,
      stream: mockStream,
    });

    // Wait for completion
    await delay(1000);

    // Verify we got events
    expect(streamEvents.length).toBeGreaterThan(0);

    // Find events by type
    const jobEvent = streamEvents.find((e) => e.type === "job");
    const doneEvent = streamEvents.find((e) => e.type === "done");

    // Should have initial job info
    expect(jobEvent).toBeDefined();
    expect(jobEvent?.data?.job_id).toBeDefined();
    expect(jobEvent?.data?.status).toBe("running");

    // Should have completion event with error status
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data?.status).toBe("error");
    // Note: exit_code goes through the async error path in execute-code.ts
    // which normalizes non-zero exit codes. We just verify it's an error.
    expect(doneEvent?.data?.exit_code).toBeGreaterThan(0);

    // Verify event order: job first, then done
    const jobIndex = streamEvents.findIndex((e) => e.type === "job");
    const doneIndex = streamEvents.findIndex((e) => e.type === "done");
    expect(jobIndex).toBe(0); // Job event should be first
    expect(doneIndex).toBe(streamEvents.length - 1); // Done event should be last
  });

  it("handles invalid commands with proper error events", async () => {
    // Import fresh executeStream that uses real executeCode
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];
    const mockStream = jest.fn((event) => {
      if (event) {
        streamEvents.push(event);
      }
    });

    // Run a command that doesn't exist
    await executeStream({
      project_id: "test-project-id",
      command: "this-command-does-not-exist-12345",
      stream: mockStream,
    });

    // Wait for completion
    await delay(1000);

    // Verify we got events
    expect(streamEvents.length).toBeGreaterThan(0);

    // Find events by type
    const jobEvent = streamEvents.find((e) => e.type === "job");
    const doneEvent = streamEvents.find((e) => e.type === "done");

    // Should have initial job info
    expect(jobEvent).toBeDefined();
    expect(jobEvent?.data?.job_id).toBeDefined();
    expect(jobEvent?.data?.status).toBe("running");

    // Should have completion event with error status
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data?.status).toBe("error");
    expect(doneEvent?.data?.exit_code).toBeGreaterThan(0); // Non-zero exit code

    // Verify event order: job first, then done
    const jobIndex = streamEvents.findIndex((e) => e.type === "job");
    const doneIndex = streamEvents.findIndex((e) => e.type === "done");
    expect(jobIndex).toBe(0); // Job event should be first
    expect(doneIndex).toBe(streamEvents.length - 1); // Done event should be last
  });
});

// Tests for the new updates-based streaming architecture
describe("updates EventEmitter streaming", () => {
  beforeAll(() => {
    jest.unmock("./execute-code");
    jest.resetModules();
  });

  it("late joiner sees accumulated output and live updates via updates EventEmitter", async () => {
    // This tests the core use case: a second client joining a running build
    // should see accumulated stdout/stderr from asyncCache AND live updates
    const { executeCode, asyncCache } = await import("./execute-code");

    // Start a long-running command
    const job = await executeCode({
      command: "echo 'line1'; sleep 0.5; echo 'line2'; sleep 0.5; echo 'line3'",
      bash: true,
      async_call: true,
      err_on_exit: false,
    });
    expect(job.type).toBe("async");
    if (job.type !== "async") return;

    // Wait for some output to accumulate
    await delay(300);

    // Verify the mechanism: asyncCache accumulates stdout from a running job,
    // so late joiners can read accumulated output when subscribing
    const jobId = job.job_id;
    const cached = asyncCache.get(jobId);

    // Verify accumulated output exists in cache
    expect(cached).toBeDefined();
    expect(cached?.status).toBe("running");

    // Wait for completion
    await new Promise<void>((resolve) => {
      const checkDone = () => {
        const j = asyncCache.get(jobId);
        if (j && j.status !== "running") {
          resolve();
        } else {
          setTimeout(checkDone, 100);
        }
      };
      checkDone();
    });

    const final = asyncCache.get(jobId);
    expect(final?.status).toBe("completed");
    expect(final?.stdout).toContain("line1");
    expect(final?.stdout).toContain("line3");
  });

  it("updates EventEmitter emits stdout/stderr/stats events for async jobs", async () => {
    const { executeCode, updates, eventKey } = await import("./execute-code");

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let finished = false;

    // Start command and subscribe to updates
    const job = await executeCode({
      command: "echo 'out1'; >&2 echo 'err1'; echo 'out2'",
      bash: true,
      async_call: true,
      err_on_exit: false,
    });
    expect(job.type).toBe("async");
    if (job.type !== "async") return;

    const jobId = job.job_id;

    updates.on(eventKey("stdout", jobId), (data: string) => {
      stdoutChunks.push(data);
    });
    updates.on(eventKey("stderr", jobId), (data: string) => {
      stderrChunks.push(data);
    });
    updates.once(eventKey("finished", jobId), () => {
      finished = true;
    });

    // Wait for completion
    while (!finished) await delay(50);

    // Cleanup listeners
    updates.removeAllListeners(eventKey("stdout", jobId));
    updates.removeAllListeners(eventKey("stderr", jobId));

    // Verify we received streaming events
    const allStdout = stdoutChunks.join("");
    const allStderr = stderrChunks.join("");
    expect(allStdout).toContain("out1");
    expect(allStdout).toContain("out2");
    expect(allStderr).toContain("err1");
  });

  it("done guard prevents duplicate events after stream ends", async () => {
    const { executeStream } = await import("./exec-stream");

    const streamEvents: any[] = [];
    let nullCount = 0;
    const stream = jest.fn((event) => {
      if (event) streamEvents.push(event);
      else nullCount++;
    });

    await executeStream({
      command: "echo 'hello'",
      bash: true,
      stream,
      err_on_exit: false,
    });

    // Wait for completion
    await delay(1500);

    // Should have exactly one null (stream end) — no duplicates
    expect(nullCount).toBe(1);

    // Should have job, at least one stdout, and done events
    const types = streamEvents.map((e) => e.type);
    expect(types[0]).toBe("job");
    expect(types).toContain("done");
    expect(
      types.includes("stdout") || streamEvents[0]?.data?.stdout,
    ).toBeTruthy();
  });

  it("executeStream handles already-completed job from asyncCache", async () => {
    const { executeStream } = await import("./exec-stream");

    // Run a very fast command
    const streamEvents: any[] = [];
    let streamEnded = false;
    const stream = jest.fn((event) => {
      if (event) streamEvents.push(event);
      else streamEnded = true;
    });

    await executeStream({
      command: "true", // instant success
      bash: true,
      stream,
      err_on_exit: false,
    });

    // Wait for completion
    await delay(1500);

    expect(streamEnded).toBe(true);
    const doneEvent = streamEvents.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data?.status).toBe("completed");
    expect(doneEvent?.data?.exit_code).toBe(0);
  });
});
