import os
import random
import re
import select
import sys
import termios
import time
import tty


def read_cpr(fd: int, timeout=1.0):
    os.write(sys.stdout.fileno(), b"\x1b[6n")
    sys.stdout.flush()
    buf = b""
    end = time.time() + timeout
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if not r:
            continue
        buf += os.read(fd, 64)
        m = re.search(rb"\x1b\[(\d+);(\d+)R", buf)
        if m:
            return int(m.group(1)), int(m.group(2))
    return None


def mv(r, c):
    sys.stdout.write(f"\x1b[{r};{c}H")


def put(r, c, s):
    mv(r, c)
    sys.stdout.write(s)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def terminal_size():
    try:
        size = os.get_terminal_size(sys.stdin.fileno())
        return size.lines, size.columns
    except OSError:
        return 24, 80


def main():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        print("ERROR: CPRs aren't supported here (stdin/stdout is not a TTY).")
        return 1

    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)

    tty.setcbreak(fd)
    h, w = 20, 40

    try:
        first_cpr = read_cpr(fd)
        if first_cpr is None:
            print("ERROR: CPRs aren't supported by this terminal.")
            return 1
        initial_row, initial_col = first_cpr

        # Reserve room below existing output so animation stays "after" prior lines.
        reserve_rows = h + 4
        sys.stdout.write("\n" * reserve_rows)
        sys.stdout.flush()

        # Anchor the drawing region inside the newly created area.
        second_cpr = read_cpr(fd)
        if second_cpr is None:
            print("ERROR: CPRs aren't supported by this terminal.")
            return 1
        draw_row, _ = second_cpr

        rows, cols = terminal_size()
        max_row = max(1, rows - (h + 3))
        max_col = max(1, cols - (w + 2))
        r0 = clamp(draw_row - (h + 3), 1, max_row)
        c0 = clamp(1, 1, max_col)

        sys.stdout.write("\x1b[?25l")  # hide cursor

        # Double-walled box border
        put(r0, c0, "╔" + "═" * w + "╗")
        put(r0 + h + 1, c0, "╚" + "═" * w + "╝")
        for i in range(1, h + 1):
            put(r0 + i, c0, "║")
            put(r0 + i, c0 + w + 1, "║")

        # Random starting point and direction inside the grid.
        x = random.randint(1, w)
        y = random.randint(1, h)
        dx = random.choice([-1, 1])
        dy = random.choice([-1, 1])

        # Trail grows from tiny dot -> rings -> filled circle -> ball.
        # All share the ball's cycling color so they're clearly visible.
        TRAIL_CHARS = ["·", "∙", "∘", "○", "◎", "◉"]  # oldest -> newest
        BALL = "●"
        TRAIL_LEN = len(TRAIL_CHARS)
        trail = []  # list of (row, col), oldest first

        for t in range(300):
            # Erase the position falling off the back of the trail
            if len(trail) == TRAIL_LEN:
                er, ec = trail[0]
                put(r0 + er, c0 + ec, " ")
                trail.pop(0)
            color = 31 + (t % 6)
            # Redraw trail: '.' far back, 'o' close to ball, all in ball's color
            for i, (tr, tc) in enumerate(trail):
                put(r0 + tr, c0 + tc, f"\x1b[{color}m{TRAIL_CHARS[i]}\x1b[0m")
            put(r0 + y, c0 + x, f"\x1b[{color}m{BALL}\x1b[0m")
            put(
                r0 + h + 3,
                c0,
                f"grid={h}x{w}  initial=({initial_row},{initial_col})  anchor=({r0},{c0})  ball=({y},{x})  vel=({dy:+d},{dx:+d})",
            )
            sys.stdout.flush()
            time.sleep(0.03)

            trail.append((y, x))
            bounced = False

            if x + dx < 1 or x + dx > w:
                dx *= -1
                bounced = True
                # Jitter: occasionally perturb the orthogonal axis on wall hit.
                if random.random() < 0.35:
                    dy *= -1

            if y + dy < 1 or y + dy > h:
                dy *= -1
                bounced = True
                # Jitter: occasionally perturb the orthogonal axis on wall hit.
                if random.random() < 0.35:
                    dx *= -1

            x += dx
            y += dy

            if bounced and random.random() < 0.4:
                # Small random post-bounce offset for less deterministic paths.
                x += random.choice([-1, 0, 1])
                y += random.choice([-1, 0, 1])
                x = clamp(x, 1, w)
                y = clamp(y, 1, h)
        return 0
    finally:
        sys.stdout.write("\x1b[0m\x1b[?25h\n")  # reset + show cursor
        sys.stdout.flush()
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


if __name__ == "__main__":
    raise SystemExit(main())
