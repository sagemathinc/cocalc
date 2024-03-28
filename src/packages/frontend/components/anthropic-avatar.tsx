import { CSS } from "@cocalc/frontend/app-framework";

// The base64 encoded png is exactly the Anthropic icon from their website, with transparent background, and compressed using pngnq.
// Why? Importing it from a file and including it causes a nextjs error.

export default function AnthropicAvatar({
  size = 64,
  style,
  backgroundColor = "transparent",
}: {
  size: number;
  style?: CSS;
  backgroundColor?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-block",
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          backgroundColor,
          color: "white",
          height: size,
          top: "0px",
        }}
      >
        <img
          alt="Anthropic AI Icon"
          width={size}
          height={size}
          src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJQAAACUCAMAAABC4vDmAAADAFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////+/v7+/v78/Pz8/Pz6+vr6+vr4+Pj4+Pj39/f19fX19fXz8/Pz8/Px8fHx8fHv7+/u7u7u7u7s7Ozs7Ozq6urq6uro6Ojn5+fn5+fl5eXl5eXj4+Pi4uLi4uLg4ODg4ODe3t7e3t7c3Nzb29vb29vZ2dnZ2dnX19fW1tbW1tbU1NTU1NTS0tLR0dHR0dHPz8/Nzc3Nzc3MzMzMzMzKysrJycnJycnHx8fHx8fFxcXExMTExMTCwsLBwcHBwcG/v7+/v7+9vb28vLy8vLy6urq5ubm5ubm3t7e2tra2tra0tLSysrKysrKxsbGxsbGvr6+urq6urq6srKyrq6urq6upqamoqKioqKimpqalpaWlpaWjo6OioqKioqKgoKCfn5+dnZ2dnZ2cnJybm5ubm5uZmZmYmJiYmJiWlpaVlZWTk5OTk5OSkpKRkZGRkZGPj4+Ojo6MjIyMjIyLi4uKioqKioqIiIiHh4eGhoaGhoaEhISDg4OBgYGBgYGAgIB/f39+fn5+fn58fHx7e3t6enp6enp4eHh3d3d2dnZ0dHR0dHRzc3NycnJxcXFvb29vb29ubm5tbW1sbGxqampqamppaWloaGhnZ2dmZmZkZGRkZGRjY2NiYmJhYWFgYGBeXl5dXV1dXV1cXFxbW1taWlpZWVlYWFhWVlZVVVVVVVVUVFRTU1NSUlJRUVFQUFBPT09OTk5NTU1MTExLS0tKSkpISEhHR0dGRkZFRUVERERDQ0NCQkIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMMjtSAAAAE3RSTlMAAAAAAAAAAAAAAAAAAAAAAABpUJ9ocQAAAAFiS0dEAIgFHUgAAAAGdEVYdFRpdGxlAKju0icAAAAHdEVYdEF1dGhvcgCprsxIAAAADHRFWHREZXNjcmlwdGlvbgATCSEjAAAACnRFWHRDb3B5cmlnaHQArA/MOgAAAAd0RVh0RS1tYWlsAH0Im9UAAAAEdEVYdFVSTAB4o9MPAAAB2UlEQVR42u3bwW0DMRBDUbYw/VfJDtxAEK9G5GhlcM8B9PIp2LGBoF74IKigggoqqKCCCiqooIIKKqiggvoFFP98nv2cC8UdFGdRvANVcyhybD8BSp8K+yZ9KgWKd6BqBkUO7idB8QyKnEylQfEOVPlR5Oh+IhTnUeRsKhWKd6DKiyKH95OhOIsip1PpULwDVT4UOb5fD1Xe/dAK9XSZpqqFenzcMKqcVx299bz7oRnKuh+aoayptCgeQ60dp0f9e7BvP3RDOfdDO5QxlRrFI6j147Sor4e69kM/lG+/LZTrXRkb69lSYSeU66pjJ5TrqhtQHEZ1j1OhpJ+iFlNhK5QpFfZCea66BcVBlPruraIWfjPDftgMZUmF3VCOVCYUh1BVY/thO5Rhv+eoxUeNogW1oLKheAeqdlDk6f18KCpR5PFURhTvQFUXRZ7fz4miCkW+IJUVxTtQ1UGRb9jPi6ICRb4ilRlFF6oePrqrDplJ+D2NEKX7rAWdSZdKiZKlOoCqFdS2SbafFKXaD19eOOtEKihDqVIdQdVTlMQk2k+M0ux3BlXPUCJTSf6AUaMkqSA2Sa66HKW46pC9mgtTQR1K8WVx/hMyqKCCCiqooIIKKqigggrqt1EfihpRJjZggFoAAAAASUVORK5CYII="
        ></img>
      </div>
    </div>
  );
}
