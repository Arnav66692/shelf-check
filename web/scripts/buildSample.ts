import { writeFileSync } from "node:fs";
import { buildCabinetItem, createOpenFdaClient, createRxNavClient } from "../../engine/src/index.ts";
import { SAMPLE_QUERIES } from "../src/lib/sample.ts";

const BASE = process.argv[2] ?? "http://localhost:3411";

const products = [];
for (const query of SAMPLE_QUERIES) {
  const response = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`);
  const body = (await response.json()) as { products: { id: string; productNdc?: string; displayName: string; kind: string }[] };
  const product = body.products[0];
  if (!product?.productNdc) throw new Error(`No product with a drug code for ${query}`);
  products.push(product);
}

const openFda = createOpenFdaClient();
const rxNav = createRxNavClient();
const items: Record<string, unknown> = {};
for (const product of products) {
  items[product.id] = await buildCabinetItem(
    { id: product.id, productNdc: product.productNdc as string, displayName: product.displayName, kind: product.kind as "otc" | "rx" },
    { openFda, rxNav },
  );
}

writeFileSync(new URL("../src/lib/sampleProducts.json", import.meta.url), JSON.stringify(products));
writeFileSync(new URL("../src/server/sampleItems.json", import.meta.url), JSON.stringify(items));
console.log(`saved ${products.length} products and ${Object.keys(items).length} checked items`);
