import { style, ensureSharedStyles, createKeyBlocker } from "../shared";

export function createGroupCreateView(params: { onBack: () => void; onCreate: (name: string, isPublic: boolean) => void | Promise<void> }): HTMLElement {
  ensureSharedStyles();

  const { onBack, onCreate } = params;

  const root = document.createElement("div");
  style(root, { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" });

  // Header
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    marginBottom: "16px",
  });

  // Back button
  const backBtn = document.createElement("button");
  style(backBtn, {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    transition: "all 120ms ease",
    flexShrink: "0",
  });
  backBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
  backBtn.onclick = onBack;

  backBtn.onmouseenter = () => {
    style(backBtn, { background: "rgba(255,255,255,0.08)", borderColor: "rgba(94,234,212,0.35)" });
  };
  backBtn.onmouseleave = () => {
    style(backBtn, { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" });
  };

  // Title
  const title = document.createElement("div");
  style(title, {
    fontSize: "15px",
    fontWeight: "700",
    color: "#e7eef7",
  });
  title.textContent = "Create New Group";

  header.append(backBtn, title);

  // Form container
  const formContainer = document.createElement("div");
  style(formContainer, {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflow: "auto",
    paddingRight: "8px",
  });
  formContainer.className = "qws-ch-scrollable";

  // Group name field
  const nameField = createFormField("Group Name", "Enter group name...", "text");
  const nameInput = nameField.input;

  // Block game inputs when input is focused
  const keyBlocker = createKeyBlocker(() => document.activeElement === nameInput);
  keyBlocker.attach();

  // Visibility toggle
  const visibilitySection = document.createElement("div");
  style(visibilitySection, { display: "flex", flexDirection: "column", gap: "10px" });

  const visibilityLabel = document.createElement("div");
  style(visibilityLabel, {
    fontSize: "12px",
    fontWeight: "600",
    color: "#e7eef7",
  });
  visibilityLabel.textContent = "Visibility";

  const visibilityOptions = document.createElement("div");
  style(visibilityOptions, { display: "flex", gap: "10px" });

  let isPublic = false;

  const privateOption = createVisibilityOption(
    "Private",
    "Only invited members can join",
    true,
    () => {
      isPublic = false;
      privateOption.classList.add("active");
      publicOption.classList.remove("active");
      // Update styles inline
      style(privateOption, {
        borderColor: "rgba(94,234,212,0.35)",
        background: "rgba(94,234,212,0.12)",
      });
      style(publicOption, {
        borderColor: "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      });
    },
  );

  const publicOption = createVisibilityOption(
    "Public",
    "Anyone can join",
    false,
    () => {
      isPublic = true;
      publicOption.classList.add("active");
      privateOption.classList.remove("active");
      // Update styles inline
      style(publicOption, {
        borderColor: "rgba(94,234,212,0.35)",
        background: "rgba(94,234,212,0.12)",
      });
      style(privateOption, {
        borderColor: "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      });
    },
  );

  visibilityOptions.append(privateOption, publicOption);
  visibilitySection.append(visibilityLabel, visibilityOptions);

  // Info box
  const infoBox = document.createElement("div");
  style(infoBox, {
    padding: "12px",
    borderRadius: "10px",
    background: "rgba(94,234,212,0.08)",
    border: "1px solid rgba(94,234,212,0.2)",
    fontSize: "12px",
    color: "rgba(226,232,240,0.8)",
    lineHeight: "1.5",
  });
  infoBox.innerHTML = `
    <div style="font-weight: 600; color: #5eead4; margin-bottom: 6px;">📋 Group Info</div>
    <ul style="margin: 0; padding-left: 18px;">
      <li>You will be the owner of this group</li>
      <li>Maximum 100 members per group</li>
      <li>You can rename or delete the group later</li>
    </ul>
  `;

  formContainer.append(nameField.container, visibilitySection, infoBox);

  // Actions
  const actions = document.createElement("div");
  style(actions, {
    display: "flex",
    gap: "10px",
    padding: "12px 0", // Padding top and bottom to prevent buttons from being stuck to edges
    borderTop: "1px solid rgba(255,255,255,0.08)",
  });

  const cancelBtn = document.createElement("button");
  style(cancelBtn, {
    flex: "1",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
  });
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = onBack;

  cancelBtn.onmouseenter = () => {
    style(cancelBtn, { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)" });
  };
  cancelBtn.onmouseleave = () => {
    style(cancelBtn, { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" });
  };

  const createBtn = document.createElement("button");
  style(createBtn, {
    flex: "1",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(94,234,212,0.3)",
    background: "rgba(94,234,212,0.18)",
    color: "#5eead4",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
  });
  createBtn.textContent = "Create Group";

  createBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      // Shake animation on error
      nameField.container.style.animation = "none";
      setTimeout(() => {
        nameField.container.style.animation = "shake 0.3s ease";
      }, 10);
      nameInput.focus();
      return;
    }

    // Disable button during creation
    createBtn.disabled = true;
    style(createBtn, { opacity: "0.5", cursor: "not-allowed" });
    const originalText = createBtn.textContent;
    createBtn.textContent = "Creating...";

    try {
      await onCreate(name, isPublic);
    } finally {
      // Re-enable button
      createBtn.disabled = false;
      style(createBtn, { opacity: "1", cursor: "pointer" });
      createBtn.textContent = originalText || "Create Group";
    }
  };

  createBtn.onmouseenter = () => {
    style(createBtn, { background: "rgba(94,234,212,0.25)", borderColor: "rgba(94,234,212,0.5)" });
  };
  createBtn.onmouseleave = () => {
    style(createBtn, { background: "rgba(94,234,212,0.18)", borderColor: "rgba(94,234,212,0.3)" });
  };

  actions.append(cancelBtn, createBtn);

  root.append(header, formContainer, actions);

  // Add shake animation to styles
  if (!document.getElementById("group-create-shake-animation")) {
    const style = document.createElement("style");
    style.id = "group-create-shake-animation";
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
    `;
    document.head.appendChild(style);
  }

  // Cleanup key blocker on destroy
  (root as any).__cleanup = () => {
    keyBlocker.detach();
  };

  return root;
}

function createFormField(label: string, placeholder: string, type: string = "text") {
  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", gap: "8px" });

  const labelEl = document.createElement("label");
  style(labelEl, {
    fontSize: "12px",
    fontWeight: "600",
    color: "#e7eef7",
  });
  labelEl.textContent = label;

  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.maxLength = 40;
  style(input, {
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 150ms ease",
  });

  input.onfocus = () => style(input, { borderColor: "rgba(94,234,212,0.35)" });
  input.onblur = () => style(input, { borderColor: "rgba(255,255,255,0.12)" });

  // Character counter
  const counter = document.createElement("div");
  style(counter, {
    fontSize: "11px",
    color: "rgba(226,232,240,0.5)",
    textAlign: "right",
  });
  counter.textContent = `0 / 40`;

  input.oninput = () => {
    const length = input.value.length;
    counter.textContent = `${length} / 40`;
    style(counter, { color: length > 35 ? "#fbbf24" : "rgba(226,232,240,0.5)" });
  };

  container.append(labelEl, input, counter);

  return { container, input };
}

function createVisibilityOption(
  title: string,
  description: string,
  active: boolean,
  onClick: () => void,
): HTMLElement {
  const option = document.createElement("div");
  style(option, {
    flex: "1",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  if (active) {
    option.classList.add("active");
    style(option, {
      borderColor: "rgba(94,234,212,0.35)",
      background: "rgba(94,234,212,0.12)",
    });
  }

  const titleEl = document.createElement("div");
  style(titleEl, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
    marginBottom: "4px",
  });
  titleEl.textContent = title;

  const descEl = document.createElement("div");
  style(descEl, {
    fontSize: "11px",
    color: "rgba(226,232,240,0.6)",
    lineHeight: "1.4",
  });
  descEl.textContent = description;

  option.append(titleEl, descEl);

  option.onclick = onClick;

  option.onmouseenter = () => {
    if (!option.classList.contains("active")) {
      style(option, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.15)" });
    }
  };
  option.onmouseleave = () => {
    if (!option.classList.contains("active")) {
      style(option, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" });
    }
  };

  return option;
}
