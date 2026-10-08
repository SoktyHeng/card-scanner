import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { NavigationLinks } from "../components/layout/main-navigation";
import { ScanSteps } from "../components/scanner/scan-steps";
import { CardListSkeleton } from "../components/cards/card-skeletons";

afterEach(cleanup);
test("navigation marks only the current section, including detail and edit routes, with semantic links", () => {
  for (const [pathname, active] of [["/dashboard", "Dashboard"], ["/cards", "Cards"], ["/cards/123/edit", "Cards"], ["/scan", "Scan card"]]) {
    const view = render(createElement(NavigationLinks, { pathname }));
    assert.equal(view.getByRole("link", { name: active }).getAttribute("aria-current"), "page");
    assert.equal(view.container.querySelectorAll('[aria-current="page"]').length, 1);
    assert.equal(view.getAllByRole("link").length, 3);
    assert.ok(view.getByRole("navigation").classList.contains("grid-cols-3"));
    assert.ok(view.getAllByRole("link").every(link => link.classList.contains("min-h-11")));
    view.unmount();
  }
});
test("scan progress names all stages and identifies the current step without extra interactive controls", () => {
  for (let current = 0; current < 5; current++) {
    const view = render(createElement(ScanSteps, { current }));
    const steps = view.getAllByRole("listitem");
    assert.equal(steps.length, 5);
    assert.equal(steps[current].getAttribute("aria-current"), "step");
    assert.equal(view.container.querySelectorAll('[aria-current="step"]').length, 1);
    assert.equal(view.queryByRole("button"), null);
    view.unmount();
  }
});
test("loading keeps six decorative cards and accessible announcements in the responsive grid", () => {
  const view = render(createElement(CardListSkeleton));
  assert.match(view.getByRole("status").textContent!, /Loading your cards/);
  const grid = view.container.querySelector(".lg\\:grid-cols-3");
  assert.equal(grid?.children.length, 6);
  assert.ok(grid?.classList.contains("sm:grid-cols-2"));
  assert.ok(grid?.closest('[aria-hidden="true"]'));
});
