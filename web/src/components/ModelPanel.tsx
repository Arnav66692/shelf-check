import { WireModel, type ModelName } from "./WireModel";

export function ModelPanel({ name, caption, className = "" }: { name: ModelName; caption: string; className?: string }) {
  return (
    <figure className={`facts !p-0 relative h-[340px] overflow-hidden ${className}`} aria-hidden="true">
      <WireModel name={name} />
      <figcaption className="absolute left-4 bottom-3 label hud-bar">{caption}</figcaption>
    </figure>
  );
}
