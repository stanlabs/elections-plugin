<?php if ( ! defined( 'ABSPATH' ) ) exit; ?>
<div class="er-wrap">
  <div class="er-header">
    <h1>Election Results Dashboard</h1>
    <p class="er-sub">Upload a JSON data file to power the <code>[election_results]</code> shortcode.</p>
  </div>

  <?php if ( $notice ) : ?>
    <div class="er-notice <?php echo $is_error ? 'er-notice--error' : 'er-notice--success'; ?>">
      <?php echo esc_html( $notice ); ?>
    </div>
  <?php endif; ?>

  <div class="er-grid">

    <!-- Upload card -->
    <div class="er-card">
      <h2>Upload JSON File</h2>
      <p>The file must match the election results JSON schema. Uploading a new file will replace any existing data.</p>
      <form method="post" enctype="multipart/form-data">
        <?php wp_nonce_field( 'er_upload', 'er_nonce' ); ?>
        <label class="er-file-label" for="er_json">
          <span class="er-file-icon">&#128196;</span>
          <span id="er-file-name">Choose election-data.json&hellip;</span>
          <input type="file" id="er_json" name="er_json" accept=".json,application/json" required
            onchange="document.getElementById('er-file-name').textContent = this.files[0]?.name || 'Choose election-data.json\u2026'">
        </label>
        <button type="submit" name="er_upload" class="er-btn er-btn--primary">&#8593; Upload</button>
      </form>
    </div>

    <!-- Status card -->
    <div class="er-card">
      <h2>Current Data File</h2>
      <?php if ( $summary ) : ?>
        <table class="er-summary">
          <tr><th>File</th><td><code><?php echo esc_html( ER_JSON_FILE ); ?></code></td></tr>
          <tr><th>Size</th><td><?php echo esc_html( $summary['size'] ); ?></td></tr>
          <tr><th>Last updated</th><td><?php echo esc_html( $summary['modified'] ); ?></td></tr>
          <tr><th>Jurisdictions</th><td><?php echo esc_html( $summary['jurisdictions'] ); ?></td></tr>
          <tr><th>Total races</th><td><?php echo esc_html( $summary['races'] ); ?></td></tr>
        </table>
        <form method="post" style="margin-top:16px;"
          onsubmit="return confirm('Delete the election data file? The shortcode will show a placeholder until a new file is uploaded.');">
          <?php wp_nonce_field( 'er_delete', 'er_del_nonce' ); ?>
          <button type="submit" name="er_delete" class="er-btn er-btn--danger">&#128465; Delete file</button>
        </form>
      <?php else : ?>
        <p class="er-empty">No data file uploaded yet.</p>
      <?php endif; ?>
    </div>

    <!-- Usage card -->
    <div class="er-card er-card--full">
      <h2>How to Use</h2>
      <ol class="er-steps">
        <li>Upload your <code>election-data.json</code> file using the form above.</li>
        <li>Create or edit any WordPress page or post.</li>
        <li>Add the shortcode <code>[election_results]</code> anywhere in the content.</li>
        <li>Publish the page — the full dashboard will appear automatically.</li>
        <li>To update results, simply upload a new JSON file. The page refreshes on next load.</li>
      </ol>
    </div>

  </div>
</div>
