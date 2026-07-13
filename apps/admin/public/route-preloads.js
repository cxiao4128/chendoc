(function preloadRouteAssets() {
  var loginRoutes = ["/", "/login", "/forgot-password", "/register"];
  if (!loginRoutes.includes(window.location.pathname)) return;

  [
    ["/site-assets/login-wallpaper-small.webp", "(max-width: 720px)"],
    ["/site-assets/login-wallpaper.webp", "(min-width: 721px)"]
  ].forEach(function addPreload(item) {
    var link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = item[0];
    link.media = item[1];
    link.fetchPriority = "high";
    document.head.appendChild(link);
  });
})();
