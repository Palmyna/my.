export function SiteFooter() {
  return <footer className="site-footer">
    <span>Conditions d’utilisation</span>
    <small className="site-copyright">© {new Date().getFullYear()} · MY. · v{__APP_VERSION__}</small>
  </footer>
}
