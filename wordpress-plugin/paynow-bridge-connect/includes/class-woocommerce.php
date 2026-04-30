<?php
/**
 * WooCommerce payment gateway adapter for ManishaPay.
 *
 * Loaded only when WooCommerce is active (see paynow-bridge-connect.php).
 * Inherits from WC_Payment_Gateway and implements the minimum surface:
 *   - admin form fields (uses our central settings page; only the toggle here)
 *   - process_payment() — calls the gateway and redirects to PayNow
 *   - return handler — listens for ?pnbc_return= and updates the order
 */

if ( ! defined( 'ABSPATH' ) ) exit;
if ( ! class_exists( 'WC_Payment_Gateway' ) ) return;

class PNBC_WC_Gateway extends WC_Payment_Gateway {

	public function __construct() {
		$this->id                 = 'manishapay';
		$this->method_title       = __( 'PayNow Bridge', 'paynow-bridge-connect' );
		$this->method_description = __( 'Accept PayNow Zimbabwe payments through the ManishaPay middleware.', 'paynow-bridge-connect' );
		$this->title              = __( 'PayNow', 'paynow-bridge-connect' );
		$this->has_fields         = false;
		$this->supports           = array( 'products' );

		$this->init_form_fields();
		$this->init_settings();

		$this->enabled = $this->get_option( 'enabled', 'no' );

		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
		add_action( 'init', array( $this, 'maybe_handle_return' ) );
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled' => array(
				'title'   => __( 'Enable', 'paynow-bridge-connect' ),
				'type'    => 'checkbox',
				'label'   => __( 'Enable PayNow Bridge', 'paynow-bridge-connect' ),
				'default' => 'no',
			),
		);
	}

	public function process_payment( $order_id ) {
		$order = wc_get_order( $order_id );

		$reference = 'wc-' . $order->get_id() . '-' . wp_generate_password( 6, false );

		$response = wp_remote_post(
			trailingslashit( pnbc_opt( 'api_base', 'https://api.manishapay.dev' ) ) . 'v1/pay',
			array(
				'timeout' => 15,
				'headers' => array(
					'Authorization' => 'Bearer ' . pnbc_opt( 'api_key' ),
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'reference'   => $reference,
					'amount'      => number_format( (float) $order->get_total(), 2, '.', '' ),
					'description' => sprintf( 'Order #%d', $order->get_id() ),
					'email'       => $order->get_billing_email(),
					'return_url'  => add_query_arg(
						array(
							'pnbc_return' => $reference,
							'order_id'    => $order->get_id(),
						),
						$this->get_return_url( $order )
					),
				) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			wc_add_notice( $response->get_error_message(), 'error' );
			return;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		$url  = $body['data']['browser_url'] ?? '';

		if ( ! $url ) {
			wc_add_notice( __( 'PayNow gateway did not return a redirect URL.', 'paynow-bridge-connect' ), 'error' );
			return;
		}

		$order->update_meta_data( '_pnbc_reference', $reference );
		$order->update_status( 'pending', __( 'Awaiting PayNow confirmation.', 'paynow-bridge-connect' ) );
		$order->save();

		return array( 'result' => 'success', 'redirect' => $url );
	}

	/**
	 * When the buyer comes back from PayNow we hit /v1/pay/{ref}/status to
	 * confirm the order — never trust query string state alone.
	 */
	public function maybe_handle_return() {
		if ( empty( $_GET['pnbc_return'] ) || empty( $_GET['order_id'] ) ) return;

		$reference = sanitize_text_field( wp_unslash( $_GET['pnbc_return'] ) );
		$order_id  = absint( $_GET['order_id'] );
		$order     = wc_get_order( $order_id );
		if ( ! $order ) return;

		$response = wp_remote_get(
			trailingslashit( pnbc_opt( 'api_base', 'https://api.manishapay.dev' ) ) . 'v1/pay/' . rawurlencode( $reference ) . '/status',
			array(
				'timeout' => 15,
				'headers' => array( 'Authorization' => 'Bearer ' . pnbc_opt( 'api_key' ) ),
			)
		);
		if ( is_wp_error( $response ) ) return;

		$body   = json_decode( wp_remote_retrieve_body( $response ), true );
		$status = strtolower( $body['data']['live']['status'] ?? $body['data']['status'] ?? '' );

		if ( in_array( $status, array( 'paid', 'awaiting delivery' ), true ) ) {
			$order->payment_complete( $reference );
			$order->add_order_note( sprintf( 'PayNow confirmed (ref %s).', $reference ) );
		}
	}
}
