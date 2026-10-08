import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FlippableCardImage } from "../components/cards/flippable-card-image";

afterEach(cleanup);
test("front-only and back-only images have side labels and no flip controls", () => {
  for (const side of ["front", "back"] as const) {
    const view = render(createElement(FlippableCardImage, { frontUrl: side === "front" ? "/front.png" : null, backUrl: side === "back" ? "/back.png" : null }));
    assert.equal(view.getAllByRole("img").length, 1);
    assert.ok(!view.queryByRole("button"));
    assert.equal(view.getByRole("status").textContent, side === "front" ? "Front" : "Back");
    view.unmount();
  }
});
test("two sides flip through semantic keyboard buttons and hide the inactive face", () => {
  const view = render(createElement(FlippableCardImage, { frontUrl: "/front.png", backUrl: "/back.png" }));
  const imageButton = view.getByRole("button", { name: "Show back of card" });
  assert.equal(imageButton.tagName, "BUTTON");
  assert.equal(imageButton.getAttribute("type"), "button");
  assert.equal(view.getByRole("img").getAttribute("alt"), "Original card front");
  fireEvent.click(imageButton);
  assert.equal(view.getByRole("img").getAttribute("alt"), "Original card back");
  assert.ok(view.container.querySelector(".card-flip-back"));
  fireEvent.click(view.getByRole("button", { name: "Show front" }));
  assert.equal(view.getByRole("status").textContent, "Front");
  fireEvent.error(view.getByRole("img"));
  assert.match(view.getByRole("alert").textContent!, /temporary image link/);
  assert.ok(view.getByRole("button", { name: "Reload card images" }));
});
