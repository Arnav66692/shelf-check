import { Fragment } from "react";

const STEP_MS = 70;

export function Reveal({ lines, delay = 0 }: { lines: string[]; delay?: number }) {
  let index = 0;
  return (
    <>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} className="block">
          {line.split(" ").map((word, wordIndex) => {
            const wait = delay + index++ * STEP_MS;
            return (
              <Fragment key={wordIndex}>
                {wordIndex > 0 && " "}
                <span className="reveal-word" style={{ animationDelay: `calc(var(--intro-delay, 0ms) + ${wait}ms)` }}>
                  {word.split(/(S)/).map((part, partIndex) =>
                    part === "S" ? (
                      <span key={partIndex} className="swash">
                        S
                      </span>
                    ) : (
                      <Fragment key={partIndex}>{part}</Fragment>
                    ),
                  )}
                </span>
              </Fragment>
            );
          })}
        </span>
      ))}
    </>
  );
}
