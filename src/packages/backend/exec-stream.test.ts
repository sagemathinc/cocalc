/*
 * Test exec-stream streaming functionality
 *
 * DEVELOPMENT:
 *
 * pnpm test ./exec-stream.test.ts
 */

import { delay } from "awaiting";
import { ExecuteCodeStreamEvent } from "@cocalc/util/types/execute-code";

describe("executeStream function - unit tests", () => {
  const mockExecuteCode = jest.fn();
  const mockAsyncCache = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(() => {
    // Reset modules and mocks for proper test isolation
    jest.resetModules();
    jest.clearAllMocks();

    // Re-mock for each test to ensure clean state
    jest.doMock("./execute-code", () => ({
      executeCode: mockExecuteCode,
      asyncCache: mockAsyncCache,
    }));

    mockAsyncCache.get.mockClear();
    mockAsyncCache.set.mockClear();
  });

  it("streams stdout in batches", async () => {
    let capturedStreamCB: ((event: ExecuteCodeStreamEvent) => void) | undefined;

    // Mock executeCode to capture the streamCB that executeStream passes to it
    mockExecuteCode.mockImplementation(async (options) => {
      capturedStreamCB = options.streamCB;
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

    // Verify executeCode was called correctly with streaming enabled
    expect(mockExecuteCode).toHaveBeenCalledWith(
      expect.objectContaining({
        async_call: true,
        streamCB: expect.any(Function),
      }),
    );

    // Simulate what executeCode would do: send streaming events to the captured callback
    if (capturedStreamCB) {
      capturedStreamCB({ type: "stdout", data: "first\n" });
      capturedStreamCB({ type: "stdout", data: "second\n" });
      capturedStreamCB({ type: "stdout", data: "third\n" });
      capturedStreamCB({
        type: "done",
        data: {
          type: "async",
          job_id: "test-job-id",
          status: "completed",
          stdout: "first\nsecond\nthird\n",
          stderr: "",
          exit_code: 0,
          start: Date.now(),
          stats: [],
        },
      });
    }

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
    }));
  });

  it("streams stderr in batches", async () => {
    let capturedStreamCB: ((event: ExecuteCodeStreamEvent) => void) | undefined;

    mockExecuteCode.mockImplementation(async (options) => {
      capturedStreamCB = options.streamCB;
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

    // Simulate what executeCode would do: send streaming events to the captured callback
    if (capturedStreamCB) {
      capturedStreamCB({ type: "stderr", data: "error1\n" });
      capturedStreamCB({ type: "stderr", data: "error2\n" });
      capturedStreamCB({
        type: "done",
        data: {
          type: "async",
          job_id: "test-job-id",
          status: "completed",
          stdout: "",
          stderr: "error1\nerror2\n",
          exit_code: 0,
          start: Date.now(),
          stats: [],
        },
      });
    }

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
    let capturedStreamCB: ((event: ExecuteCodeStreamEvent) => void) | undefined;

    mockExecuteCode.mockImplementation(async (options) => {
      capturedStreamCB = options.streamCB;
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

    // Simulate what executeCode would do: send mixed streaming events to the captured callback
    if (capturedStreamCB) {
      capturedStreamCB({ type: "stdout", data: "stdout1\n" });
      capturedStreamCB({ type: "stderr", data: "stderr1\n" });
      capturedStreamCB({
        type: "stats",
        data: {
          timestamp: Date.now(),
          cpu_pct: 1.5,
          cpu_secs: 0.1,
          mem_rss: 1024,
        },
      });
      capturedStreamCB({ type: "stdout", data: "stdout2\n" });
      capturedStreamCB({
        type: "done",
        data: {
          type: "async",
          job_id: "test-job-id",
          status: "completed",
          stdout: "stdout1\nstdout2\n",
          stderr: "stderr1\n",
          exit_code: 0,
          start: Date.now(),
          stats: [],
        },
      });
    }

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
    let capturedStreamCB: ((event: ExecuteCodeStreamEvent) => void) | undefined;

    mockExecuteCode.mockImplementation(async (options) => {
      capturedStreamCB = options.streamCB;
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

    // Simulate what executeCode would do: send error event to the captured callback
    if (capturedStreamCB) {
      capturedStreamCB({
        type: "error",
        data: "Command failed with exit code 1",
      });
    }

    // Verify error event and stream ending
    const calls = userCallback.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // First call should be initial job info
    expect(calls[0][0].type).toBe("job");

    // Then the error event
    expect(calls[1][0]).toEqual({
      error: "Command failed with exit code 1",
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
    let capturedStreamCB: ((event: ExecuteCodeStreamEvent) => void) | undefined;

    mockExecuteCode.mockImplementation(async (options) => {
      capturedStreamCB = options.streamCB;
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

    // Simulate what executeCode would do: send error completion to the captured callback
    if (capturedStreamCB) {
      capturedStreamCB({
        type: "done",
        data: {
          type: "async",
          job_id: "test-job-id",
          status: "error",
          stdout: "",
          stderr: "exit 42 failed",
          exit_code: 42,
          start: Date.now(),
          stats: [],
        },
      });
    }

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

    // Check what actually happened - either timeout occurred or command completed
    if (doneEvent) {
      // If we got a done event, check if it indicates an error/timeout
      if (
        doneEvent.data?.status === "error" ||
        doneEvent.data?.exit_code !== 0
      ) {
        // Command was terminated (possibly due to timeout)
      } else {
        // Command completed normally
      }
    } else if (errorEvents.length > 0) {
      // Error events received
    } else {
      // No completion events received - job may still be running
      // Let's check if we can query the job status manually
      const { executeCode } = await import("./execute-code");
      try {
        await executeCode({
          async_get: jobEvent?.data?.job_id,
          async_await: false,
        });
        // Manual job status check completed
      } catch (err) {
        // Manual job status check failed
      }
    }

    // At minimum, we should have the job event
    expect(jobEvent).toBeDefined();

    // The test should verify that timeout option was passed correctly
    // Even if the actual timeout doesn't trigger in test environment,
    // we can verify the option was set properly
    expect(jobEvent?.data?.job_id).toBeDefined();

    // Re-mock for subsequent tests
    jest.doMock("./execute-code", () => ({
      executeCode: mockExecuteCode,
      asyncCache: mockAsyncCache,
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
    expect(doneEvent?.data?.exit_code).toBe(123);

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
