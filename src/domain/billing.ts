export const subscriptionStatuses = [
  "ACTIVE",
  "DUE_SOON",
  "OVERDUE_GRACE",
  "BLOCKED",
  "CANCELED",
] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export interface PaymentProvider {
  createCharge(input: {
    subscriptionId: string;
    amountInCents: number;
    dueAt: string;
    payerEmail: string;
  }): Promise<{ providerChargeId: string; paymentUrl: string }>;
  verifyWebhook(signature: string, requestId: string, body: string): Promise<boolean>;
  getPaymentStatus(providerChargeId: string): Promise<"PENDING" | "PAID" | "FAILED" | "REFUNDED">;
}

export type AccessDecision = {
  canOperate: boolean;
  canViewFinancial: boolean;
  canViewPublishedReports: boolean;
  reason?: "PAYMENT_GRACE" | "PAYMENT_BLOCKED";
};
