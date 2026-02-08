type ButtonVariant = "primary" | "ghost" | "danger";

export function createButton(
  label: string,
  options: {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    fullWidth?: boolean;
    icon?: string | HTMLElement;
    title?: string;
  } = {},
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "qws-fo-btn";
  if (options.variant) btn.classList.add(`qws-fo-btn--${options.variant}`);
  if (options.size === "sm") btn.classList.add("qws-fo-btn--sm");
  if (options.fullWidth) btn.classList.add("qws-fo-btn--full");
  if (options.title) btn.title = options.title;

  if (options.icon) {
    const icon = document.createElement("span");
    icon.className = "qws-fo-btn__icon";
    if (typeof options.icon === "string") {
      icon.textContent = options.icon;
    } else {
      icon.appendChild(options.icon);
    }
    btn.appendChild(icon);
  }

  const labelEl = document.createElement("span");
  labelEl.className = "qws-fo-btn__label";
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  return btn;
}

export function setButtonEnabled(button: HTMLButtonElement, enabled: boolean) {
  button.disabled = !enabled;
  button.classList.toggle("is-disabled", !enabled);
  button.setAttribute("aria-disabled", (!enabled).toString());
}

export function createInput(placeholder = "", value = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value;
  input.className = "qws-fo-input";
  return input;
}

export function createCard(title: string): { root: HTMLDivElement; body: HTMLDivElement } {
  const root = document.createElement("div");
  root.className = "qws-fo-card";

  const head = document.createElement("div");
  head.className = "qws-fo-card__head";
  head.textContent = title;

  const body = document.createElement("div");
  body.className = "qws-fo-card__body";

  root.append(head, body);
  return { root, body };
}

export function createFlexRow(options: {
  align?: string;
  justify?: string;
  gap?: number;
  wrap?: boolean;
} = {}): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "qws-fo-row";
  row.style.display = "flex";
  row.style.alignItems = options.align ?? "center";
  row.style.justifyContent = options.justify ?? "flex-start";
  row.style.gap = `${options.gap ?? 8}px`;
  row.style.flexWrap = options.wrap === false ? "nowrap" : "wrap";
  return row;
}

export function createToggle(checked: boolean): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "qws-fo-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const knob = document.createElement("span");
  knob.className = "qws-fo-switch__knob";
  label.append(input, knob);
  return label;
}

export function getToggleInput(toggle: HTMLLabelElement): HTMLInputElement | null {
  return toggle.querySelector("input");
}
