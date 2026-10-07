import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDuplicateSignals, matchDuplicate, normalizeCardNumber, normalizeEmail, normalizeNameCompany, normalizePhone, type DuplicateCandidate, type DuplicateInput } from "../lib/cards/duplicates";

const empty: DuplicateInput = { email: null, phone: null, secondaryPhone: null, cardNumber: null, name: null, company: null };
const candidate: DuplicateCandidate = { id: "00000000-0000-4000-8000-000000000003", user_id: "00000000-0000-4000-8000-000000000001", email: "John+work@Example.com", phone: "+855 (12) 345-678", secondary_phone: "023 456 789", card_number: "MB-001", name: "John Smith", company: "ABC Technology", is_archived: true };

test("duplicate normalization removes formatting conservatively without changing phone display", () => {
  assert.equal(normalizeEmail("  JOHN+work@Example.com  "), "john+work@example.com");
  assert.notEqual(normalizeEmail("john.work@gmail.com"), normalizeEmail("johnwork@gmail.com"));
  assert.equal(normalizePhone(" +855 (12) 345-678 "), "+85512345678");
  assert.notEqual(normalizePhone("+85512345678"), normalizePhone("0085512345678"));
  assert.notEqual(normalizePhone("012345678"), normalizePhone("12345678"));
  assert.equal(normalizePhone("012 / 098"), "012 / 098");
  assert.equal(normalizePhone("012 ext 34"), "012 ext 34");
  assert.equal(normalizeCardNumber(" MB-001 "), "MB-001");
  assert.notEqual(normalizeCardNumber("MB-001"), normalizeCardNumber("mb001"));
  assert.equal(normalizeNameCompany(" JOHN   Smith \n"), "john smith");
  assert.notEqual(normalizeNameCompany("José"), normalizeNameCompany("Jose"));
  assert.equal(normalizeNameCompany("សុខា"), "សុខា");
  for (const normalize of [normalizeEmail, normalizePhone, normalizeCardNumber, normalizeNameCompany]) {
    assert.equal(normalize(null), null);
    assert.equal(normalize(undefined), null);
    assert.equal(normalize("  \n"), null);
  }
});

test("each matching rule reports its reason, including secondary phones and archived cards", () => {
  const inputs: Array<[Partial<DuplicateInput>, string]> = [
    [{ email: " john+WORK@example.COM " }, "email"],
    [{ phone: "+85512345678" }, "phone"],
    [{ secondaryPhone: "023456789" }, "phone"],
    [{ phone: "023456789" }, "phone"],
    [{ cardNumber: " MB-001 " }, "card_number"],
    [{ name: "JOHN  SMITH", company: "abc technology" }, "name_company"],
  ];
  const original = structuredClone(candidate);
  for (const [values, reason] of inputs) {
    const input = { ...empty, ...values };
    assert.ok(hasDuplicateSignals(input));
    const match = matchDuplicate(input, candidate);
    assert.deepEqual(match?.reasons, [reason]);
    assert.equal(match?.archived, true);
  }
  assert.deepEqual(candidate, original);
  assert.deepEqual(matchDuplicate({ email: candidate.email, phone: candidate.phone, secondaryPhone: candidate.phone, cardNumber: candidate.card_number, name: candidate.name, company: candidate.company }, candidate)?.reasons, ["email", "phone", "card_number", "name_company"]);
});

test("empty fields, partial names and companies, and different values never create matches", () => {
  for (const values of [empty, { ...empty, name: "John Smith" }, { ...empty, company: "ABC Technology" }, { ...empty, email: "  ", phone: "\n", cardNumber: " " }]) {
    assert.equal(hasDuplicateSignals(values), false);
    assert.equal(matchDuplicate(values, candidate), null);
    assert.equal(matchDuplicate(values, { ...candidate, email: null, phone: null, secondary_phone: null, name: null, company: null, card_number: null }), null);
  }
  assert.equal(matchDuplicate({ ...empty, name: candidate.name, company: "Different company", email: "other@example.com", phone: "0085512345678", cardNumber: "mb-001" }, candidate), null);
});
