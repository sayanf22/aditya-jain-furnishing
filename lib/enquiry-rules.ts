// Enquiry form rules, shared by the form (instant feedback in the browser)
// and the server handler (the real check). No server-only code here.

export const CUSTOMER_TYPES = {
  B2C: "Individual customer",
  B2B: "Business / interior designer",
} as const;
export type CustomerType = keyof typeof CUSTOMER_TYPES;

export type EnquiryInput = {
  customerType: CustomerType;
  name: string;
  phone: string;
  company?: string;
  interest?: string;
  message?: string;
  source?: string;
  website?: string;
  turnstileToken?: string;
};

export type FieldErrors = Partial<Record<"customerType" | "name" | "phone" | "company" | "message", string>>;

export const LIMITS = { name: 80, company: 100, message: 1000, source: 40, body: 8 * 1024 };

/** Normalises an Indian mobile number to +91XXXXXXXXXX, or returns null. */
export function normalisePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export function validateEnquiry(input: Partial<EnquiryInput>): { errors: FieldErrors; phone: string | null } {
  const errors: FieldErrors = {};
  if (input.customerType !== "B2C" && input.customerType !== "B2B") {
    errors.customerType = "Please choose who you are.";
  }
  const name = (input.name ?? "").trim();
  if (name.length < 2) errors.name = "Please enter your name.";
  else if (name.length > LIMITS.name) errors.name = `Please keep the name under ${LIMITS.name} characters.`;
  const phone = normalisePhone(input.phone ?? "");
  if (!phone) errors.phone = "Please enter a 10-digit mobile number.";
  if ((input.company ?? "").trim().length > LIMITS.company) errors.company = `Please keep this under ${LIMITS.company} characters.`;
  if ((input.message ?? "").trim().length > LIMITS.message) errors.message = `Please keep the message under ${LIMITS.message} characters.`;
  return { errors, phone };
}
