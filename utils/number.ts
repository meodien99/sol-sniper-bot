import Decimal from "decimal.js";

export function toDecimalPlaces(num: number | string, decimals: number): string {
  return new Decimal(num).div(10 ** decimals).toDecimalPlaces(decimals).toString()
}