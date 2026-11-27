"use client";

import { useEffect, useState } from "react";

type Flake = { left: string; duration: string; delay: string; opacity: number; size: string; symbol: string };

const SYMBOLS = ["❄", "❅", "❆"];

/** Decorative falling snow. Hidden for people who ask for reduced motion. */
export function Snowfall({ count = 36 }: { count?: number }) {
  const [flakes, setFlakes] = useState<Flake[]>([]);

  useEffect(() => {
    // Built after the page loads so the server and browser never disagree about random values.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlakes(
      Array.from({ length: count }, () => ({
        left: `${Math.random() * 100}%`,
        duration: `${Math.random() * 6 + 6}s`,
        delay: `${Math.random() * 6}s`,
        opacity: Math.random() * 0.7 + 0.2,
        size: `${Math.random() * 10 + 10}px`,
        symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      })),
    );
  }, [count]);

  return (
    <div className="snow" aria-hidden="true">
      {flakes.map((flake, i) => (
        <span
          key={i}
          className="snowflake"
          style={{
            left: flake.left,
            animationDuration: flake.duration,
            animationDelay: flake.delay,
            opacity: flake.opacity,
            fontSize: flake.size,
          }}
        >
          {flake.symbol}
        </span>
      ))}
    </div>
  );
}
