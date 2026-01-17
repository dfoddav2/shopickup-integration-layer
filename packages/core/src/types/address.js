/**
 * Address domain type
 * Represents a physical location (sender or recipient)
 */
/**
 * Validate an address has required fields
 */
export function validateAddress(addr) {
    if (typeof addr !== "object" || addr === null)
        return false;
    const a = addr;
    return (typeof a.name === "string" &&
        typeof a.street === "string" &&
        typeof a.city === "string" &&
        typeof a.postalCode === "string" &&
        typeof a.country === "string");
}
//# sourceMappingURL=address.js.map