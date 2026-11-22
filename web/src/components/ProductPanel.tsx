import { formatStrength, type Product } from "@/lib/model";

const KIND_LINE: Record<Product["kind"], string> = {
  otc: "Over the counter. Confirmed against the FDA record.",
  rx: "Prescription. Confirmed against the FDA record.",
  supplement: "Supplement. Not reviewed by the FDA. From the NIH label database.",
  vial: "Injectable. Check the dose with Dose check.",
};

export function ProductPanel({ product, action, disposal }: { product: Product; action?: React.ReactNode; disposal?: string }) {
  return (
    <article className="facts">
      <h3 className="facts-title">{product.displayName}</h3>
      <div className="facts-head">Active ingredients{product.form ? ` (${product.form.toLowerCase()})` : ""}</div>
      <div>
        {product.ingredients.map((ingredient) => (
          <div className="facts-row" key={`${ingredient.name}-${ingredient.value}`}>
            <span className="capitalize">{ingredient.name}</span>
            <span className="font-bold whitespace-nowrap">{formatStrength(ingredient)}</span>
          </div>
        ))}
        {product.ingredients.length === 0 && <div className="facts-row">No structured ingredients on record.</div>}
      </div>
      <div className="thick mt-2 pt-2 text-sm text-ink-soft">
        <div>
          {product.maker}
          {product.productNdc ? `, NDC ${product.productNdc}` : ""}
        </div>
        <div>{KIND_LINE[product.kind]}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-ink">
          <a className="underline font-bold" href={product.recordUrl} target="_blank" rel="noreferrer">
            Official record
          </a>
          {action}
        </div>
        {disposal && (
          <details className="mt-2 text-ink">
            <summary className="cursor-pointer underline font-bold">How to throw it away</summary>
            <p className="mt-1">{disposal}</p>
          </details>
        )}
      </div>
    </article>
  );
}
