import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { Button } from "../components/ui/button";

afterEach(cleanup);

test("loading buttons keep their accessible name, prevent activation and respect reduced motion", () => {
  const view = render(createElement(Button, { loading: true }, "Save card"));
  const button = view.getByRole("button", { name: "Save card" }) as HTMLButtonElement;
  assert.ok(button.disabled);
  assert.equal(button.getAttribute("aria-busy"), "true");
  const spinner = button.querySelector('svg[aria-hidden="true"]');
  assert.ok(spinner?.classList.contains("animate-spin"));
  assert.ok(spinner?.classList.contains("motion-reduce:animate-none"));
  view.rerender(createElement(Button, { loading: false }, "Save card"));
  assert.equal(button.disabled, false);
  assert.ok(!button.hasAttribute("aria-busy"));
  assert.ok(!button.querySelector("svg"));
});
