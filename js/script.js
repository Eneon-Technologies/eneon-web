(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === "dark";
    themeToggle?.setAttribute("aria-pressed", String(isDark));
    if (themeToggle) {
      themeToggle.querySelector(".theme-toggle-label").textContent = isDark ? "Light mode" : "Dark mode";
      themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
  };
  applyTheme(document.documentElement.dataset.theme || "light");
  themeToggle?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try { localStorage.setItem("eneon-theme", nextTheme); } catch (error) { /* Preference remains active for this visit. */ }
  });
  const header = document.querySelector("[data-site-header]");
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".site-nav");
  const closeMenu = () => { if (!menuButton || !navigation) return; menuButton.setAttribute("aria-expanded", "false"); navigation.classList.remove("is-open"); };
  menuButton?.addEventListener("click", () => { const open = menuButton.getAttribute("aria-expanded") === "true"; menuButton.setAttribute("aria-expanded", String(!open)); navigation.classList.toggle("is-open", !open); });
  navigation?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("scroll", () => header?.classList.toggle("is-scrolled", window.scrollY > 10), { passive: true });
  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = new Date().getFullYear(); });

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay;
        if (delay) entry.target.style.setProperty("--reveal-delay", delay + "ms");
        entry.target.classList.add("is-visible"); observer.unobserve(entry.target);
      }
    }), { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else revealItems.forEach((item) => item.classList.add("is-visible"));

  const filters = document.querySelectorAll("[data-filter]");
  const projects = document.querySelectorAll(".project-card");
  filters.forEach((filter) => filter.addEventListener("click", () => {
    const category = filter.dataset.filter;
    filters.forEach((button) => button.classList.toggle("is-selected", button === filter));
    projects.forEach((project) => project.classList.toggle("is-hidden", !(category === "all" || project.dataset.category.split(" ").includes(category))));
  }));

  const lightbox = document.querySelector("[data-lightbox]");
  const content = document.querySelector("[data-lightbox-content]");
  const caption = document.querySelector("[data-lightbox-caption]");
  const mediaButtons = [...document.querySelectorAll("[data-lightbox-media]")];
  let activeMedia = 0, lastFocusedElement = null, touchStartX = 0;
  const renderMedia = () => {
    const source = mediaButtons[activeMedia]; if (!source || !content) return;
    content.replaceChildren(); const type = source.dataset.lightboxType; let media;
    if (type === "video") { media = document.createElement("video"); media.controls = true; media.preload = "metadata"; media.poster = source.dataset.lightboxPoster || ""; }
    else { media = document.createElement("img"); media.alt = source.dataset.lightboxTitle || ""; }
    media.src = source.dataset.lightboxMedia; content.append(media);
    if (caption) caption.textContent = source.dataset.lightboxTitle || "";
  };
  const openLightbox = (index) => { if (!lightbox) return; activeMedia = index; lastFocusedElement = document.activeElement; renderMedia(); lightbox.classList.add("is-open"); lightbox.setAttribute("aria-hidden", "false"); lightbox.querySelector("[data-lightbox-close]")?.focus(); };
  const closeLightbox = () => { if (!lightbox) return; lightbox.classList.remove("is-open"); lightbox.setAttribute("aria-hidden", "true"); content?.replaceChildren(); lastFocusedElement?.focus(); };
  const changeMedia = (direction) => { if (!mediaButtons.length) return; activeMedia = (activeMedia + direction + mediaButtons.length) % mediaButtons.length; renderMedia(); };
  mediaButtons.forEach((button, index) => button.addEventListener("click", () => openLightbox(index)));
  lightbox?.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
  lightbox?.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => changeMedia(-1));
  lightbox?.querySelector("[data-lightbox-next]")?.addEventListener("click", () => changeMedia(1));
  lightbox?.addEventListener("click", (event) => { if (event.target === lightbox) closeLightbox(); });
  lightbox?.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
  lightbox?.addEventListener("touchend", (event) => { const delta = event.changedTouches[0].screenX - touchStartX; if (Math.abs(delta) > 50) changeMedia(delta > 0 ? -1 : 1); }, { passive: true });
  document.addEventListener("keydown", (event) => { if (!lightbox?.classList.contains("is-open")) return; if (event.key === "Escape") closeLightbox(); if (event.key === "ArrowLeft") changeMedia(-1); if (event.key === "ArrowRight") changeMedia(1); });

  const form = document.querySelector("[data-inquiry-form]"), formStatus = document.querySelector("[data-form-status]");
  form?.addEventListener("submit", (event) => { event.preventDefault(); if (!form.checkValidity()) { formStatus.textContent = "Please complete the required fields before preparing your enquiry."; form.reportValidity(); return; } formStatus.textContent = "Your enquiry is ready to send once a secure form service or backend is connected."; });
})();
