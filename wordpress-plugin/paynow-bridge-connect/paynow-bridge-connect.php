<?php
/**
 * Plugin Name:       PayNow Bridge Connect
 * Plugin URI:        https://manishapay.dev/wordpress
 * Description:       Connects WordPress, WooCommerce, and Gravity Forms to the ManishaPay middleware so you can accept PayNow payments without writing a single line of integration code.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            ManishaPay
 * Author URI:        https://manishapay.dev
 * License:           MIT
 * Text Domain:       paynow-bridge-connect
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'PNBC_VERSION', '1.0.0' );
define( 'PNBC_FILE', __FILE__ );
define( 'PNBC_DIR', plugin_dir_path( __FILE__ ) );
define( 'PNBC_URL', plugin_dir_url( __FILE__ ) );

require_once PNBC_DIR . 'includes/class-admin.php';
require_once PNBC_DIR . 'includes/class-shortcode.php';
require_once PNBC_DIR . 'includes/class-webhook.php';
require_once PNBC_DIR . 'includes/class-block.php';

/**
 * Boots the plugin singletons.
 */
function pnbc_boot() {
	PNBC_Admin::instance();
	PNBC_Shortcode::instance();
	PNBC_Webhook::instance();
	PNBC_Block::instance();

	// WooCommerce gateway is loaded only if Woo is active — checking the
	// class lets the plugin work on any WP install.
	add_action( 'plugins_loaded', function () {
		if ( class_exists( 'WooCommerce' ) ) {
			require_once PNBC_DIR . 'includes/class-woocommerce.php';
			add_filter( 'woocommerce_payment_gateways', function ( $gateways ) {
				$gateways[] = 'PNBC_WC_Gateway';
				return $gateways;
			} );
		}
	}, 11 );
}
add_action( 'init', 'pnbc_boot' );

/**
 * Activation: seed default options so the plugin doesn't trip on first run.
 */
register_activation_hook( __FILE__, function () {
	$defaults = array(
		'api_key'    => '',
		'mode'       => 'test',
		'api_base'   => 'https://api.manishapay.dev',
		'webhook_id' => wp_generate_uuid4(),
	);
	foreach ( $defaults as $k => $v ) {
		if ( false === get_option( 'pnbc_' . $k ) ) {
			add_option( 'pnbc_' . $k, $v );
		}
	}
} );

/**
 * Convenience accessor.
 *
 * @param string $key Option key without the `pnbc_` prefix.
 * @param mixed  $default
 * @return mixed
 */
function pnbc_opt( $key, $default = '' ) {
	return get_option( 'pnbc_' . $key, $default );
}
