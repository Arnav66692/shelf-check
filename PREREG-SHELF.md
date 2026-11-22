# Zephyr shelf scan, preregistration

Written Sun Nov 22 2026 about 11:52 AM PT, before any shelf is scored.

## The system

The shipped Zephyr model (`web/public/matcher/dinov2s-run3.q8.onnx`, run 3 DINOv2 small, int8) is run on 20 crops of one photo: the full photo, 2, 3 and 4 full height columns, a 2 by 2 grid and a 3 by 2 grid. Each crop is fit inside a 336 pixel square with grey padding. Each crop gives its best product and that product's cosine score. A product is returned if its best crop score is at least T. Returned products are deduplicated and sorted by score. The code is `tools/shelf_eval.py` and must match `web/public/matcher/worker.js`.

## Shelves

A shelf is 3 or 4 different products' generated photos (from `results/matcher4/queries`) placed side by side with 12 pixel gaps, each scaled to a random height between 80 and 100 percent of the tallest. 300 validation shelves from the val queries pick T. 300 test shelves from the test queries are scored once, after T is fixed.

## Metrics

Found rate: true products returned divided by true products on the shelf, averaged over shelves. Wrong items: returned products that are not on the shelf, per shelf.

## Pass bar

- Found rate at least 60 percent.
- Wrong items at most 1.0 per shelf on average.

Both must hold on the test shelves. These are generated photos side by side, not real phone photos of a real cabinet, so a pass says nothing about real shelves.
