const DEFAULTS = { enabled: true, density: "cozy", handle: true, ca: true, chain: true, status: true };

const bind = (controls) => {
  for (const control of controls) {
    const key = control.dataset.key;
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      const value = stored[key];
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value;
    });
    control.addEventListener("change", () => {
      const value = control.type === "checkbox" ? control.checked : control.value;
      chrome.storage.sync.set({ [key]: value });
    });
  }
};

bind(document.querySelectorAll("[data-key]"));
