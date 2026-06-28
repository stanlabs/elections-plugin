<?php
/**
 * Plugin Name:  Election Results Dashboard
 * Description:  Display live election results from an uploaded JSON file. Use [election_results] on any page or post.
 * Version:      1.0.0
 * Requires PHP: 7.4
 * Author:       The Palmer Times
 * License:      GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'ER_VERSION',   '1.0.0' );
define( 'ER_JSON_FILE', 'election-data.json' );
define( 'ER_SUBDIR',    'election-results' );

function er_upload_info() {
    $up = wp_upload_dir();
    return [
        'dir' => trailingslashit( $up['basedir'] ) . ER_SUBDIR,
        'url' => trailingslashit( $up['baseurl'] ) . ER_SUBDIR,
    ];
}
function er_json_path() {
    $i = er_upload_info();
    $p = $i['dir'] . '/' . ER_JSON_FILE;
    return file_exists( $p ) ? $p : null;
}
function er_json_url() {
    $i = er_upload_info();
    $p = $i['dir'] . '/' . ER_JSON_FILE;
    return file_exists( $p ) ? $i['url'] . '/' . ER_JSON_FILE : null;
}

// Admin menu
add_action( 'admin_menu', function () {
    add_menu_page( 'Election Results', 'Election Results', 'manage_options',
        'election-results', 'er_admin_page', 'dashicons-chart-bar', 30 );
} );

add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( $hook !== 'toplevel_page_election-results' ) return;
    wp_enqueue_style( 'er-admin', plugin_dir_url( __FILE__ ) . 'admin/admin.css', [], ER_VERSION );
} );

function er_admin_page() {
    if ( ! current_user_can( 'manage_options' ) ) return;
    $notice = null; $is_error = false;

    if ( isset( $_POST['er_upload'] ) && check_admin_referer( 'er_upload', 'er_nonce' ) ) {
        if ( ! empty( $_FILES['er_json']['tmp_name'] ) ) {
            $content = file_get_contents( $_FILES['er_json']['tmp_name'] );
            if ( json_decode( $content ) === null ) {
                $notice = 'Invalid JSON file. Check the file and try again.'; $is_error = true;
            } else {
                $info = er_upload_info(); wp_mkdir_p( $info['dir'] );
                file_put_contents( $info['dir'] . '/' . ER_JSON_FILE, $content );
                $notice = 'Election data uploaded successfully!';
            }
        } else { $notice = 'No file received. Choose a .json file.'; $is_error = true; }
    }

    if ( isset( $_POST['er_delete'] ) && check_admin_referer( 'er_delete', 'er_del_nonce' ) ) {
        $p = er_json_path(); if ( $p ) { unlink( $p ); $notice = 'Election data file deleted.'; }
    }

    $json_path = er_json_path(); $summary = null;
    if ( $json_path ) {
        $data = json_decode( file_get_contents( $json_path ), true );
        if ( $data ) {
            $juris = $data['jurisdictions'] ?? []; $races = 0;
            foreach ( $juris as $j ) foreach ( $j['elections'] ?? [] as $e ) $races += count( $e['races'] ?? [] );
            $summary = [
                'size'          => size_format( filesize( $json_path ) ),
                'modified'      => date_i18n( get_option('date_format').' '.get_option('time_format'), filemtime($json_path) ),
                'jurisdictions' => count( $juris ),
                'races'         => $races,
            ];
        }
    }
    include __DIR__ . '/admin/admin-page.php';
}

// Shortcode
add_shortcode( 'election_results', function () {
    if ( ! er_json_url() ) {
        return '<p style="color:#666;font-family:sans-serif;">No election data uploaded yet. Go to <strong>Election Results</strong> in the WordPress admin.</p>';
    }
    ob_start(); include __DIR__ . '/templates/frontend.php'; return ob_get_clean();
} );

add_action( 'wp_enqueue_scripts', function () {
    global $post;
    if ( ! is_a( $post, 'WP_Post' ) || ! has_shortcode( $post->post_content, 'election_results' ) ) return;
    wp_enqueue_style( 'barlow-condensed',
        'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap', [], null );
    wp_enqueue_style( 'er-frontend', plugin_dir_url( __FILE__ ) . 'assets/style.css', ['barlow-condensed'], ER_VERSION );
    wp_enqueue_script( 'er-frontend', plugin_dir_url( __FILE__ ) . 'assets/script.js', [], ER_VERSION, true );
    wp_localize_script( 'er-frontend', 'erConfig', [ 'dataUrl' => er_json_url() ] );
} );
