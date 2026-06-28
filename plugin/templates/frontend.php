<?php if ( ! defined( 'ABSPATH' ) ) exit; ?>
<div class="er-root" id="erRoot">
  <header class="er-site-header">
    <div class="er-header-inner">
      <div id="erYearLogo" class="er-year-logo" aria-label="Election year"></div>
      <nav class="er-jurisdiction-tabs" id="erJurisdictionTabs" aria-label="Jurisdictions"></nav>
    </div>
  </header>
  <div class="er-page-content">
    <section id="erResultsContainer" aria-live="polite"></section>
  </div>
  <template id="erRoundTemplate">
    <section class="er-round-card">
      <h4 class="er-round-title"></h4>
      <div class="er-round-table-wrap">
        <table class="er-results-table">
          <thead>
            <tr>
              <th>Candidate</th><th>Party</th><th>Votes</th><th>Percent</th><th>Status</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="er-round-note"></p>
    </section>
  </template>
</div>
