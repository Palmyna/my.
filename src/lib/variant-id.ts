// Compatibility at the boundary only: unsafe legacy numbers have already lost precision.
export type VariantIdInput = string | number

export function variantIdString(value: VariantIdInput): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid variant ID')
  const decimal = typeof value === 'number' ? String(value) : value
  if (typeof decimal !== 'string' || decimal.length > 20 || !/^(?:0|-?[1-9]\d*)$/.test(decimal)
    || BigInt(decimal) < -9223372036854775808n || BigInt(decimal) > 9223372036854775807n) {
    throw new Error('Invalid variant ID')
  }
  return decimal
}
