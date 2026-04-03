export const CATEGORIES: Record<string, string[]> = {
  Groceries: ["Supermarket"],
  "Food/Dining": [
    "Restaurant", "Bar/Restaurant", "Fast Food", "Beach Kiosk",
    "Market", "Specialty Food", "Ice Cream", "Coconut (Street Vendor)",
    "Food Court", "Bakery", "Coffee Shop",
  ],
  Housing: [
    "Rent/Mortgage", "Condo", "Gas Utility", "Electricity",
    "Internet/Phone", "Admin Fee", "Water", "Maintenance",
  ],
  Transportation: [
    "Fuel", "Fuel (Gas Station)", "Tolls", "Ride-hailing",
    "Public Transit", "Parking", "Car Maintenance",
  ],
  Health: [
    "Pharmacy", "Hospital", "Medical Lab", "Medical Services",
    "Health Plan/Service", "Wellness Plan", "Pediatrician (Newborn)",
    "Birth (Newborn)", "Instrumentadora (Newborn)",
    "Anesthesiologist (Newborn)", "Reimbursement",
  ],
  Shopping: [
    "Baby Products", "Baby/Kids Products", "Clothing", "Clothing/Shoes",
    "Electronics", "Electronics/Gaming", "Home Improvement",
    "Home Improvement/Construction", "Home & Hardware", "Hardware",
    "Hardware/Plumbing", "Jewelry", "Cosmetics", "Perfumery",
    "Sports Merchandise", "Sports/Athletic", "MercadoLivre", "Amazon",
    "Shopee", "Magazine Luiza", "Online Store", "Mall (Rio Sul)",
    "Mall (Downtown)", "Village Mall", "Customs/Import", "General",
    "Books", "Flowers", "Party Supplies", "Gift", "Home (Camicado)",
  ],
  Travel: [
    "Accommodation", "Flights", "Booking", "NuViagens",
    "Tour Package", "Car Rental",
  ],
  Wellness: ["Gym", "Gym/Training", "Club/Sports"],
  Services: [
    "Photographer", "Photographer (Surf)", "Photographer (Newborn)",
    "Personal", "Domestic Help",
  ],
  Subscriptions: [
    "Apple", "Apple IOF", "AI Tools", "AI Tools IOF", "Design Tools",
    "Microsoft", "YouTube Premium", "Mobile Plan", "Streaming",
  ],
  Insurance: ["Life Insurance", "Home Insurance", "Car Insurance"],
  "Personal Care": ["Barber", "Salon", "Spa"],
  Recreation: ["Leisure/Comfort", "Events", "Cinema", "Games"],
  "Family Support": ["Family"],
  "Investment (Troco Turbo)": ["Aplicação RDB"],
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES);

export function getSubcategories(category: string): string[] {
  return CATEGORIES[category] || [];
}
