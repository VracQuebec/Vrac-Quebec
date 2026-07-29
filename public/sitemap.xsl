<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="fr">
      <head>
        <meta charset="UTF-8"/>
        <title>Sitemap XML — Vrac Québec</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#111; color:#eee; margin:0; padding:2rem; }
          h1 { color:#7ED321; font-size:1.5rem; margin:0 0 0.25rem; }
          p { color:#aaa; margin:0 0 1.5rem; }
          table { width:100%; border-collapse:collapse; background:#1a1a1a; border-radius:8px; overflow:hidden; }
          th, td { padding:0.6rem 0.9rem; text-align:left; border-bottom:1px solid #2a2a2a; font-size:0.9rem; }
          th { background:#7ED321; color:#111; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em; }
          tr:hover td { background:#222; }
          a { color:#7ED321; text-decoration:none; }
          a:hover { text-decoration:underline; }
          .count { color:#7ED321; font-weight:bold; }
        </style>
      </head>
      <body>
        <h1>Sitemap XML — Vrac Québec</h1>
        <p><span class="count"><xsl:value-of select="count(s:urlset/s:url)"/></span> URL(s) indexables. Ce fichier est un sitemap XML conforme au standard sitemaps.org — les moteurs de recherche lisent le XML brut, cette vue est uniquement une aide humaine.</p>
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Dernière modif.</th>
              <th>Fréquence</th>
              <th>Priorité</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="s:urlset/s:url">
              <tr>
                <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
                <td><xsl:value-of select="s:lastmod"/></td>
                <td><xsl:value-of select="s:changefreq"/></td>
                <td><xsl:value-of select="s:priority"/></td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>