import type { ExtractedCard } from "../../lib/ai/types";

export function emptyCard(): ExtractedCard {
  return {
    cardType: null,
    name: null,
    company: null,
    jobTitle: null,
    department: null,
    email: null,
    phone: null,
    secondaryPhone: null,
    website: null,
    address: null,
    cardNumber: null,
    rawText: null,
    overallConfidence: 0,
    extraFields: [],
    fieldConfidences: {
      cardType: null,
      name: null,
      company: null,
      jobTitle: null,
      department: null,
      email: null,
      phone: null,
      secondaryPhone: null,
      website: null,
      address: null,
      cardNumber: null,
    },
  };
}
export function businessCard(): ExtractedCard {
  return {
    ...emptyCard(),
    name: "JOHN SMITH",
    company: "ABC Technology",
    phone: "+855 12 345 678",
    rawText: "JOHN SMITH\nABC Technology\n+855 12 345 678",
    overallConfidence: 0.97,
    fieldConfidences: {
      ...emptyCard().fieldConfidences,
      name: 0.99,
      company: 0.97,
      phone: 0.97,
    },
    extraFields: [
      {
        label: "Employee Code",
        key: "employee_code",
        value: "EMP-1001",
        confidence: 0.98,
      },
    ],
  };
}
