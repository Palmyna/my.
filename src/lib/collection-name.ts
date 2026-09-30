// Match collections_name_check: String.trim boundary whitespace and Unicode code points,
// not UTF-16 code units. Validation never changes the value sent to PostgreSQL.
export function isValidCollectionName(name: string): boolean {
  return Array.from(name.trim()).length >= 3
}
