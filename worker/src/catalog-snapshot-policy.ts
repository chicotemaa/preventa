export function shouldKeepLastGoodCatalog(
  previousProductsCount: number,
  incomingProductsCount: number,
) {
  if (previousProductsCount <= 0) {
    return false;
  }

  if (incomingProductsCount <= 0) {
    return true;
  }

  return (
    previousProductsCount >= 100 &&
    incomingProductsCount < previousProductsCount * 0.2
  );
}
