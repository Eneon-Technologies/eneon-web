(() => {
  "use strict";
  const root = document.documentElement;
  root.classList.add("js");

  /* ---------- Theme ---------- */
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    const isDark = theme === "dark";
    themeToggle?.setAttribute("aria-pressed", String(isDark));
    themeToggle?.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  };
  applyTheme(root.dataset.theme || "light");
  themeToggle?.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try { localStorage.setItem("eneon-theme", nextTheme); } catch (error) { /* Preference remains active for this visit. */ }
  });

  /* ---------- Header & navigation ---------- */
  const header = document.querySelector("[data-site-header]");
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".site-nav");
  const setMenu = (open) => {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.querySelector(".sr-only").textContent = open ? "Close navigation" : "Open navigation";
    navigation.classList.toggle("is-open", open);
  };
  menuButton?.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
  navigation?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && navigation?.classList.contains("is-open")) { setMenu(false); menuButton.focus(); } });
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = new Date().getFullYear(); });

  /* ---------- Reveal on scroll ---------- */
  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const delay = entry.target.dataset.delay;
      if (delay) entry.target.style.setProperty("--reveal-delay", delay + "ms");
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealItems.forEach((item) => observer.observe(item));
  } else revealItems.forEach((item) => item.classList.add("is-visible"));

  /* ---------- Project filters ---------- */
  const filters = document.querySelectorAll("[data-filter]");
  const projects = document.querySelectorAll(".project-card");
  filters.forEach((filter) => filter.addEventListener("click", () => {
    const category = filter.dataset.filter;
    filters.forEach((button) => {
      button.classList.toggle("is-selected", button === filter);
      button.setAttribute("aria-pressed", String(button === filter));
    });
    projects.forEach((project) => {
      const categories = (project.dataset.category || "").split(/\s+/);
      project.classList.toggle("is-hidden", !(category === "all" || categories.includes(category)));
    });
  }));

  /* ---------- Lightbox (images & video, including Cloudinary URLs) ---------- */
  // Builds a poster frame for a Cloudinary video: the frame 1s in, delivered as an image.
  const cloudinaryPoster = (url) => {
    if (!/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return "";
    const withFrame = url.replace("/video/upload/", "/video/upload/so_1/");
    return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(withFrame)
      ? withFrame.replace(/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i, ".jpg")
      : withFrame + ".jpg";
  };
  const lightbox = document.querySelector("[data-lightbox]");
  const content = document.querySelector("[data-lightbox-content]");
  const caption = document.querySelector("[data-lightbox-caption]");
  const prevButton = lightbox?.querySelector("[data-lightbox-prev]");
  const nextButton = lightbox?.querySelector("[data-lightbox-next]");
  let mediaButtons = [];
  let activeMedia = 0, lastFocusedElement = null, touchStartX = 0;
  const visibleMedia = () => [...document.querySelectorAll("[data-lightbox-media]")].filter((button) => !button.closest(".is-hidden"));
  const renderMedia = () => {
    const source = mediaButtons[activeMedia];
    if (!source || !content) return;
    content.replaceChildren();
    const url = source.dataset.lightboxMedia;
    let media;
    if (source.dataset.lightboxType === "video") {
      media = document.createElement("video");
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
      media.autoplay = true;
      const poster = source.dataset.lightboxPoster || cloudinaryPoster(url);
      if (poster) media.poster = poster;
    } else {
      media = document.createElement("img");
      media.alt = source.querySelector("img")?.alt || source.dataset.lightboxTitle || "";
      media.decoding = "async";
    }
    media.src = url;
    content.append(media);
    if (caption) caption.textContent = source.dataset.lightboxTitle || "";
    const single = mediaButtons.length < 2;
    if (prevButton) prevButton.hidden = single;
    if (nextButton) nextButton.hidden = single;
  };
  const openLightbox = (button) => {
    if (!lightbox) return;
    mediaButtons = visibleMedia();
    activeMedia = Math.max(0, mediaButtons.indexOf(button));
    lastFocusedElement = document.activeElement;
    renderMedia();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    lightbox.querySelector("[data-lightbox-close]")?.focus();
  };
  const closeLightbox = () => {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.style.overflow = "";
    content?.replaceChildren();
    lastFocusedElement?.focus();
  };
  const changeMedia = (direction) => {
    if (mediaButtons.length < 2) return;
    activeMedia = (activeMedia + direction + mediaButtons.length) % mediaButtons.length;
    renderMedia();
  };
  document.querySelectorAll("[data-lightbox-media]").forEach((button) => button.addEventListener("click", () => openLightbox(button)));
  lightbox?.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
  prevButton?.addEventListener("click", () => changeMedia(-1));
  nextButton?.addEventListener("click", () => changeMedia(1));
  lightbox?.addEventListener("click", (event) => { if (event.target === lightbox || event.target.classList.contains("lightbox-figure")) closeLightbox(); });
  lightbox?.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
  lightbox?.addEventListener("touchend", (event) => { const delta = event.changedTouches[0].screenX - touchStartX; if (Math.abs(delta) > 50) changeMedia(delta > 0 ? -1 : 1); }, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (!lightbox || lightbox.hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") changeMedia(-1);
    if (event.key === "ArrowRight") changeMedia(1);
    if (event.key === "Tab") {
      // Keep keyboard focus inside the open dialog.
      const focusable = [...lightbox.querySelectorAll("button:not([hidden]), video")];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Enquiry form ---------- */
  // With data-endpoint set (e.g. a Formspree URL) the form posts there; otherwise it opens
  // the visitor's email app with the enquiry pre-filled and addressed to data-mailto.
  const form = document.querySelector("[data-inquiry-form]");
  const formStatus = document.querySelector("[data-form-status]");
  const setStatus = (message, state) => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle("is-error", state === "error");
    formStatus.classList.toggle("is-success", state === "success");
  };
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      setStatus("Please complete the required fields.", "error");
      form.querySelector(":invalid")?.focus();
      return;
    }
    const data = new FormData(form);
    if (data.get("_gotcha")) return;
    const endpoint = form.dataset.endpoint?.trim();
    const submitButton = form.querySelector("[type=submit]");

    if (endpoint) {
      submitButton.disabled = true;
      setStatus("Sending…");
      try {
        const response = await fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        form.reset();
        form.classList.remove("was-validated");
        setStatus("Thank you — your enquiry has been sent. We will be in touch shortly.", "success");
      } catch (error) {
        setStatus(`Something went wrong. Please try again or email ${form.dataset.mailto}.`, "error");
      } finally {
        submitButton.disabled = false;
      }
      return;
    }

    const labels = { name: "Name", email: "Email", company: "Company", phone: "Phone", "project-type": "Project type", timeline: "Timeline" };
    const lines = Object.entries(labels).map(([key, label]) => data.get(key) ? `${label}: ${data.get(key)}` : "").filter(Boolean);
    const body = `${lines.join("\n")}\n\n${data.get("message")}`;
    const subject = `Project enquiry — ${data.get("name")}${data.get("company") ? ` (${data.get("company")})` : ""}`;
    window.location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus("Your email app should open with your enquiry ready to send.", "success");
  });
})();
