import videojs from "video.js";

type Representation = {
  height: number;
  enabled: (v?: boolean) => boolean | void;
};

function getReps(player: ReturnType<typeof videojs>): Representation[] {
  try {
    // VHS exposes representations via the tech internals — no extra plugin needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tech = (player as any).tech({ IWillNotUseThisInPlugins: true });
    const vhs = tech?.vhs ?? tech?.hls;
    return (vhs?.representations() as Representation[]) ?? [];
  } catch {
    return [];
  }
}

export function mountQualitySelector(player: ReturnType<typeof videojs>): () => void {
  // Wrapper lives inside the Video.js control bar
  const wrapper = document.createElement("div");
  wrapper.className = "vjs-quality-selector";

  const btn = document.createElement("button");
  btn.className = "vjs-quality-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Select quality");
  btn.textContent = "Auto";
  wrapper.appendChild(btn);

  // Menu is appended to <body> so it escapes the player's overflow:hidden
  const menu = document.createElement("ul");
  menu.className = "vjs-quality-menu";
  document.body.appendChild(menu);

  let selected: number | "auto" = "auto";
  let injected = false;

  function renderMenu() {
    menu.innerHTML = "";
    const reps = getReps(player);
    if (!reps.length) return;

    const heights = [...new Set(reps.map((r) => r.height))]
      .filter(Boolean)
      .sort((a, b) => b - a);

    const options: Array<{ label: string; value: number | "auto" }> = [
      { label: "Auto", value: "auto" },
      ...heights.map((h) => ({ label: `${h}p`, value: h })),
    ];

    for (const opt of options) {
      const li = document.createElement("li");
      const isActive = selected === opt.value;
      li.className = "vjs-quality-item" + (isActive ? " active" : "");
      li.innerHTML = `<span>${opt.label}</span>${isActive ? '<span class="vjs-quality-check">&#10003;</span>' : ""}`;
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        applyQuality(opt.value);
      });
      menu.appendChild(li);
    }
  }

  function applyQuality(value: number | "auto") {
    selected = value;
    getReps(player).forEach((r) =>
      r.enabled(value === "auto" || r.height === value)
    );
    btn.textContent = value === "auto" ? "Auto" : `${value}p`;
    closeMenu();
  }

  function positionMenu() {
    const rect = btn.getBoundingClientRect();
    // Open upward above the button, right-aligned
    menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = "auto";
  }

  function openMenu() {
    renderMenu();
    positionMenu();
    menu.classList.add("open");
  }

  function closeMenu() {
    menu.classList.remove("open");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.contains("open") ? closeMenu() : openMenu();
  });

  // Close when clicking anywhere outside the button or menu
  const onDocClick = (e: MouseEvent) => {
    if (!wrapper.contains(e.target as Node) && !menu.contains(e.target as Node)) {
      closeMenu();
    }
  };
  document.addEventListener("click", onDocClick, true);

  // Close when Video.js hides controls
  const onInactive = () => closeMenu();
  player.on("userinactive", onInactive);

  function inject() {
    if (injected) return;
    const cb = player.getChild("ControlBar");
    if (!cb) return;
    const cbEl = cb.el() as HTMLElement;
    // Insert before the fullscreen button
    const fs = cbEl.querySelector(".vjs-fullscreen-control");
    cbEl.insertBefore(wrapper, fs ?? null);
    injected = true;
  }

  // Inject after metadata loads (representations are available then)
  player.one("loadedmetadata", inject);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((player as any).readyState() >= 1) inject();

  return () => {
    document.removeEventListener("click", onDocClick, true);
    player.off("userinactive", onInactive);
    menu.remove();
    wrapper.remove();
  };
}
