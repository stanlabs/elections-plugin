<?php
/**
 * Plugin Name: Elections Dashboard
 * Description: Renders the elections dashboard and lets admins upload JSON data with version history and rollback.
 * Version: 1.0.0
 * Author: Elections Workspace
 */

if (!defined('ABSPATH')) {
	exit;
}

final class Elections_Dashboard_Plugin {
	const OPTION_VERSIONS = 'elections_dashboard_versions';
	const OPTION_ACTIVE_VERSION_ID = 'elections_dashboard_active_version_id';
	const MAX_VERSIONS = 25;
	const UPLOAD_NONCE_ACTION = 'elections_dashboard_upload_json';
	const ROLLBACK_NONCE_ACTION = 'elections_dashboard_rollback_json';

	public static function init() {
		add_action('init', array(__CLASS__, 'register_shortcode'));
		add_action('wp_enqueue_scripts', array(__CLASS__, 'register_assets'));
		add_action('admin_menu', array(__CLASS__, 'register_admin_page'));
		add_action('admin_post_elections_dashboard_upload', array(__CLASS__, 'handle_upload'));
		add_action('admin_post_elections_dashboard_rollback', array(__CLASS__, 'handle_rollback'));
	}

	public static function register_shortcode() {
		add_shortcode('elections_dashboard', array(__CLASS__, 'render_shortcode'));
	}

	public static function register_assets() {
		$base_url = plugin_dir_url(__FILE__);
		$base_path = plugin_dir_path(__FILE__);

		wp_register_style(
			'elections-dashboard-style',
			$base_url . 'style.css',
			array(),
			file_exists($base_path . 'style.css') ? (string) filemtime($base_path . 'style.css') : '1.0.0'
		);

		wp_register_script(
			'elections-dashboard-script',
			$base_url . 'script.js',
			array(),
			file_exists($base_path . 'script.js') ? (string) filemtime($base_path . 'script.js') : '1.0.0',
			true
		);
	}

	public static function render_shortcode() {
		wp_enqueue_style('elections-dashboard-style');
		wp_enqueue_script('elections-dashboard-script');

		$active_version = self::get_active_version();
		$data_url = $active_version ? $active_version['url'] : plugin_dir_url(__FILE__) . 'election-data.json';

		wp_localize_script(
			'elections-dashboard-script',
			'ElectionsDashboardSettings',
			array(
				'dataUrl' => esc_url_raw($data_url),
				'versionId' => $active_version ? $active_version['id'] : 'bundled-default',
			)
		);

		ob_start();
		?>
		<div id="intro-overlay" aria-hidden="true">
			<canvas id="intro-canvas"></canvas>
			<div id="intro-logo"></div>
			<div id="intro-title">Elections</div>
		</div>
		<header class="site-header">
			<div class="header-inner">
				<div id="yearLogo" class="year-logo" aria-label="Election year"></div>
				<nav class="jurisdiction-tabs" id="jurisdictionTabs" aria-label="Jurisdictions"></nav>
			</div>
		</header>
		<main class="page-content">
			<section id="resultsContainer" aria-live="polite"></section>
		</main>
		<template id="roundTemplate">
			<section class="round-card">
				<h4 class="round-title"></h4>
				<div class="round-table-wrap">
					<table class="results-table">
						<thead>
						<tr>
							<th>Candidate</th>
							<th>Party</th>
							<th>Votes</th>
							<th>Percent</th>
							<th>Status</th>
						</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>
				<p class="round-note"></p>
			</section>
		</template>
		<?php
		return (string) ob_get_clean();
	}

	public static function register_admin_page() {
		add_menu_page(
			'Elections Dashboard',
			'Elections Dashboard',
			'manage_options',
			'elections-dashboard',
			array(__CLASS__, 'render_admin_page'),
			'dashicons-chart-bar',
			58
		);
	}

	public static function render_admin_page() {
		if (!current_user_can('manage_options')) {
			wp_die(esc_html__('You do not have permission to access this page.', 'elections-dashboard'));
		}

		$versions = self::get_versions();
		$active_id = self::get_active_version_id();
		$status = isset($_GET['ed_status']) ? sanitize_text_field(wp_unslash($_GET['ed_status'])) : '';
		$message = isset($_GET['ed_msg']) ? sanitize_text_field(wp_unslash($_GET['ed_msg'])) : '';
		?>
		<div class="wrap">
			<h1>Elections Dashboard Data</h1>
			<?php if (!empty($message)) : ?>
				<div class="notice notice-<?php echo $status === 'success' ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html($message); ?></p>
				</div>
			<?php endif; ?>

			<h2>Upload New JSON</h2>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" enctype="multipart/form-data">
				<?php wp_nonce_field(self::UPLOAD_NONCE_ACTION); ?>
				<input type="hidden" name="action" value="elections_dashboard_upload"/>
				<input type="file" name="elections_json" accept=".json,application/json" required/>
				<?php submit_button('Upload and Activate', 'primary', 'submit', false); ?>
			</form>

			<h2 style="margin-top: 24px;">Upload History</h2>
			<?php if (empty($versions)) : ?>
				<p>No uploaded versions yet. The dashboard uses the bundled <code>election-data.json</code> file.</p>
			<?php else : ?>
				<table class="widefat striped">
					<thead>
					<tr>
						<th>Active</th>
						<th>Uploaded</th>
						<th>Original File</th>
						<th>Size</th>
						<th>Actions</th>
					</tr>
					</thead>
					<tbody>
					<?php foreach ($versions as $version) : ?>
						<tr>
							<td><?php echo $active_id === $version['id'] ? 'Yes' : 'No'; ?></td>
							<td><?php echo esc_html($version['uploaded_at']); ?></td>
							<td><?php echo esc_html($version['original_name']); ?></td>
							<td><?php echo esc_html(size_format((int) $version['size'])); ?></td>
							<td>
								<?php if ($active_id === $version['id']) : ?>
									<span>Current version</span>
								<?php else : ?>
									<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline;">
										<?php wp_nonce_field(self::ROLLBACK_NONCE_ACTION . ':' . $version['id']); ?>
										<input type="hidden" name="action" value="elections_dashboard_rollback"/>
										<input type="hidden" name="version_id" value="<?php echo esc_attr($version['id']); ?>"/>
										<?php submit_button('Rollback to this version', 'secondary', 'submit', false); ?>
									</form>
								<?php endif; ?>
							</td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}

	public static function handle_upload() {
		if (!current_user_can('manage_options')) {
			self::redirect_with_message('error', 'You do not have permission to upload election data.');
		}

		check_admin_referer(self::UPLOAD_NONCE_ACTION);

		if (!isset($_FILES['elections_json'])) {
			self::redirect_with_message('error', 'No file was uploaded.');
		}

		$file = $_FILES['elections_json'];
		if (!is_array($file) || !isset($file['error']) || (int) $file['error'] !== UPLOAD_ERR_OK) {
			self::redirect_with_message('error', 'Upload failed. Please try again.');
		}

		$original_name = isset($file['name']) ? sanitize_file_name(wp_unslash($file['name'])) : '';
		if (strtolower((string) pathinfo($original_name, PATHINFO_EXTENSION)) !== 'json') {
			self::redirect_with_message('error', 'Only .json files are allowed.');
		}

		$tmp_name = isset($file['tmp_name']) ? (string) $file['tmp_name'] : '';
		if ($tmp_name === '' || !is_uploaded_file($tmp_name)) {
			self::redirect_with_message('error', 'Upload did not pass server validation.');
		}

		$file_info = wp_check_filetype_and_ext($tmp_name, $original_name, array('json' => 'application/json'));
		if (empty($file_info['ext']) || $file_info['ext'] !== 'json') {
			self::redirect_with_message('error', 'Uploaded file must be a valid JSON document.');
		}

		$raw_json = file_get_contents($tmp_name);
		if ($raw_json === false) {
			self::redirect_with_message('error', 'Could not read the uploaded file.');
		}

		$decoded = json_decode($raw_json, true);
		if (JSON_ERROR_NONE !== json_last_error()) {
			self::redirect_with_message('error', 'Invalid JSON: ' . json_last_error_msg());
		}

		if (!self::looks_like_elections_payload($decoded)) {
			self::redirect_with_message('error', 'JSON does not match expected elections structure.');
		}

		$upload_dir = wp_upload_dir();
		if (!empty($upload_dir['error'])) {
			self::redirect_with_message('error', 'WordPress upload directory is not available.');
		}

		$target_dir = trailingslashit($upload_dir['basedir']) . 'elections-dashboard';
		if (!wp_mkdir_p($target_dir)) {
			self::redirect_with_message('error', 'Could not create upload directory for elections data.');
		}

		$version_id = gmdate('YmdHis') . '-' . wp_generate_password(6, false, false);
		$target_name = 'election-data-' . $version_id . '.json';
		$target_path = trailingslashit($target_dir) . $target_name;
		$target_url = trailingslashit($upload_dir['baseurl']) . 'elections-dashboard/' . $target_name;

		$normalized_json = wp_json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
		if (!is_string($normalized_json) || file_put_contents($target_path, $normalized_json) === false) {
			self::redirect_with_message('error', 'Could not persist uploaded JSON.');
		}

		$versions = self::get_versions();
		array_unshift(
			$versions,
			array(
				'id' => $version_id,
				'uploaded_at' => current_time('mysql'),
				'original_name' => $original_name,
				'path' => $target_path,
				'url' => $target_url,
				'size' => strlen($normalized_json),
			)
		);

		$trimmed_versions = array();
		foreach ($versions as $index => $version) {
			if ($index < self::MAX_VERSIONS) {
				$trimmed_versions[] = $version;
				continue;
			}
			if (!empty($version['path']) && file_exists($version['path'])) {
				wp_delete_file($version['path']);
			}
		}

		update_option(self::OPTION_VERSIONS, $trimmed_versions, false);
		update_option(self::OPTION_ACTIVE_VERSION_ID, $version_id, false);
		self::redirect_with_message('success', 'Election data uploaded and activated.');
	}

	public static function handle_rollback() {
		if (!current_user_can('manage_options')) {
			self::redirect_with_message('error', 'You do not have permission to rollback election data.');
		}

		$version_id = isset($_POST['version_id']) ? sanitize_text_field(wp_unslash($_POST['version_id'])) : '';
		if ($version_id === '') {
			self::redirect_with_message('error', 'Missing version id for rollback.');
		}

		check_admin_referer(self::ROLLBACK_NONCE_ACTION . ':' . $version_id);

		$versions = self::get_versions();
		foreach ($versions as $version) {
			if ($version['id'] === $version_id) {
				update_option(self::OPTION_ACTIVE_VERSION_ID, $version_id, false);
				self::redirect_with_message('success', 'Rolled back to selected version.');
			}
		}

		self::redirect_with_message('error', 'Selected version was not found.');
	}

	private static function looks_like_elections_payload($decoded) {
		if (!is_array($decoded)) {
			return false;
		}

		if (isset($decoded['jurisdictions'])) {
			return is_array($decoded['jurisdictions']) && count($decoded['jurisdictions']) > 0;
		}

		return self::is_list_array($decoded) && count($decoded) > 0;
	}

	private static function is_list_array($array) {
		if (!is_array($array)) {
			return false;
		}

		$index = 0;
		foreach ($array as $key => $value) {
			if ($key !== $index) {
				return false;
			}
			$index++;
		}

		return true;
	}

	private static function get_versions() {
		$versions = get_option(self::OPTION_VERSIONS, array());
		if (!is_array($versions)) {
			return array();
		}

		$normalized = array();
		foreach ($versions as $version) {
			if (
				!is_array($version) ||
				empty($version['id']) ||
				empty($version['uploaded_at']) ||
				empty($version['original_name']) ||
				empty($version['path']) ||
				empty($version['url']) ||
				!isset($version['size'])
			) {
				continue;
			}

			if (!file_exists($version['path'])) {
				continue;
			}

			$normalized[] = array(
				'id' => (string) $version['id'],
				'uploaded_at' => (string) $version['uploaded_at'],
				'original_name' => (string) $version['original_name'],
				'path' => (string) $version['path'],
				'url' => (string) $version['url'],
				'size' => (int) $version['size'],
			);
		}

		return $normalized;
	}

	private static function get_active_version_id() {
		$id = get_option(self::OPTION_ACTIVE_VERSION_ID, '');
		return is_string($id) ? $id : '';
	}

	private static function get_active_version() {
		$active_id = self::get_active_version_id();
		if ($active_id === '') {
			return null;
		}

		$versions = self::get_versions();
		foreach ($versions as $version) {
			if ($version['id'] === $active_id) {
				return $version;
			}
		}

		return null;
	}

	private static function redirect_with_message($status, $message) {
		$url = add_query_arg(
			array(
				'page' => 'elections-dashboard',
				'ed_status' => $status,
				'ed_msg' => $message,
			),
			admin_url('admin.php')
		);
		wp_safe_redirect($url);
		exit;
	}
}

Elections_Dashboard_Plugin::init();
