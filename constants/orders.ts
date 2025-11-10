// Mock menu items for a coffee shop
export const COFFEE_SHOP_MENU = [
  { id: "item-001", name: "Latte", priceCents: 450 },
  { id: "item-002", name: "Flat White", priceCents: 480 },
  { id: "item-003", name: "Cappuccino", priceCents: 450 },
  { id: "item-004", name: "Matcha Latte", priceCents: 550 },
  { id: "item-005", name: "Mocha", priceCents: 520 },
  { id: "item-006", name: "Americano", priceCents: 380 },
  { id: "item-007", name: "Espresso", priceCents: 320 },
  { id: "item-008", name: "Cortado", priceCents: 420 },
  { id: "item-009", name: "Cold Brew", priceCents: 480 },
  { id: "item-010", name: "Iced Latte", priceCents: 480 },
  { id: "item-011", name: "Chai Latte", priceCents: 500 },
  { id: "item-012", name: "Hot Chocolate", priceCents: 450 },
  { id: "item-013", name: "Croissant", priceCents: 380 },
  { id: "item-014", name: "Blueberry Muffin", priceCents: 420 },
  { id: "item-015", name: "Avocado Toast", priceCents: 850 },
  { id: "item-016", name: "Bagel & Cream Cheese", priceCents: 520 },
];

// Helper function to generate random orders
export const generateRandomOrder = () => {
  // Pick 1-4 random items
  const itemCount = Math.floor(Math.random() * 4) + 1;
  const orderItems = [];

  for (let i = 0; i < itemCount; i++) {
    const menuItem =
      COFFEE_SHOP_MENU[Math.floor(Math.random() * COFFEE_SHOP_MENU.length)];
    const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity

    orderItems.push({
      id: `order-item-${Date.now()}-${i}`,
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPriceCents: menuItem.priceCents,
      subtotalCents: menuItem.priceCents * quantity,
    });
  }

  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.subtotalCents,
    0
  );
  const tax = Math.round(subtotal * 0.1);
  const tronc = Math.round(subtotal * 0.12);

  return {
    status: "open" as const,
    tableId: `table-${String(Math.floor(Math.random() * 20) + 1).padStart(
      3,
      "0"
    )}`,
    guestId: `guest-${Date.now()}`,
    itemsJson: JSON.stringify(orderItems),
    subtotalCents: subtotal,
    discountCents: 0,
    taxCents: tax,
    troncCents: tronc,
    totalCents: subtotal + tax + tronc,
  };
};

// Helper to format cents to currency
export const formatCurrency = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};
