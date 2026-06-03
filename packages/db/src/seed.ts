import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb, createPool } from "./client.js";
import { faqs } from "./schema.js";

config({ path: new URL("../../../.env", import.meta.url) });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const seedFaqs = [
  {
    key: "shipping-policy",
    question: "What is your shipping policy?",
    answer:
      "Orders are processed within 1 business day. Standard shipping takes 3-5 business days and express shipping takes 1-2 business days.",
    sortOrder: 10,
  },
  {
    key: "usa-international-shipping",
    question: "Do you ship to the USA or internationally?",
    answer:
      "We ship across India and to the USA, Canada, UK, Australia, and Singapore. International delivery usually takes 7-14 business days.",
    sortOrder: 20,
  },
  {
    key: "returns-refunds",
    question: "What is your return and refund policy?",
    answer:
      "Customers can return unused items within 30 days of delivery. Refunds are issued to the original payment method after inspection.",
    sortOrder: 30,
  },
  {
    key: "order-changes",
    question: "Can I change or cancel my order?",
    answer:
      "Orders can be changed or cancelled within 2 hours of purchase. After fulfillment starts, customers should wait for delivery and request a return.",
    sortOrder: 40,
  },
  {
    key: "support-hours",
    question: "What are your support hours?",
    answer:
      "Support is available Monday through Friday, 9:00 AM to 6:00 PM IST. Weekend messages are answered on the next business day.",
    sortOrder: 50,
  },
  {
    key: "damaged-items",
    question: "What should I do if my item arrives damaged?",
    answer:
      "Customers should contact support within 48 hours with photos of the damaged item and packaging. We will arrange a replacement or refund.",
    sortOrder: 60,
  },
];

const pool = createPool(databaseUrl);
const db = createDb(pool);

for (const faq of seedFaqs) {
  const existing = await db.query.faqs.findFirst({
    where: eq(faqs.key, faq.key),
  });

  if (existing) {
    await db
      .update(faqs)
      .set({ ...faq, updatedAt: new Date() })
      .where(eq(faqs.key, faq.key));
  } else {
    await db.insert(faqs).values(faq);
  }
}

await pool.end();
console.log(`Seeded ${seedFaqs.length} FAQ rows.`);
