import { Fragment } from "react";

export function Swash({ text }: { text: string }) {
  return (
    <>
      {text.split(/(S)/).map((part, index) =>
        part === "S" ? (
          <span key={index} className="swash">
            S
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
