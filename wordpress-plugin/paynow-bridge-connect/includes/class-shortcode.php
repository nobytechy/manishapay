<?php
/**
 * [paynow_bridge_button] shortcode + AJAX handler.
 *
 * Usage:
 *   [paynow_bridge_button amount="10" description="Pro plan" label="Pay $10"]
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class PNBC_Shortcode {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) self::$instance = new self();
		return self::$instance;
	}

	private function __construct() {
		add_shortcode( 'paynow_bridge_button', array( $this, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'wp_ajax_pnbc_initiate',        array( $this, 'ajax_initiate' ) );
		add_action( 'wp_ajax_nopriv_pnbc_initiate', array( $this, 'ajax_initiate' ) );
	}

	public function enqueue() {
		wp_register_script( 'pnbc-public', PNBC_URL . 'assets/public.js', array(), PNBC_VERSION, true );
		wp_localize_script( 'pnbc-public', 'PNBC', array(
			'ajax'  => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'pnbc_button' ),
		) );
	}

	public function render( $atts ) {
		$atts = shortcode_atts(
			array(
				'amount'      => '0.00',
				'description' => '',
				'label'       => __( 'Pay now', 'paynow-bridge-connect' ),
				'reference'   => '',
			),
			$atts,
			'paynow_bridge_button'
		);

		wp_enqueue_script( 'pnbc-public' );

		$reference = $atts['reference'] ? $atts['reference'] : 'wp-' . wp_generate_uuid4();

		ob_start();
		?>
		<button
			type="button"
			class="pnbc-button"
			data-amount="<?php echo esc_attr( $atts['amount'] ); ?>"
			data-description="<?php echo esc_attr( $atts['description'] ); ?>"
			data-reference="<?php echo esc_attr( $reference ); ?>"
		>
			<?php echo esc_html( $atts['label'] ); ?>
		</button>
		<?php
		return ob_get_clean();
	}

	/**
	 * AJAX endpoint hit by public.js. Talks to the ManishaPay gateway and
	 * returns the redirect URL the buyer should be sent to.
	 */
	public function ajax_initiate() {
		check_ajax_referer( 'pnbc_button', 'nonce' );

		$amount      = isset( $_POST['amount'] ) ? sanitize_text_field( wp_unslash( $_POST['amount'] ) ) : '';
		$description = isset( $_POST['description'] ) ? sanitize_text_field( wp_unslash( $_POST['description'] ) ) : '';
		$reference   = isset( $_POST['reference'] ) ? sanitize_text_field( wp_unslash( $_POST['reference'] ) ) : '';

		if ( ! $amount || ! $reference ) {
			wp_send_json_error( array( 'message' => 'amount and reference required' ), 400 );
		}

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
					'amount'      => $amount,
					'description' => $description,
					'email'       => is_user_logged_in() ? wp_get_current_user()->user_email : '',
					'return_url'  => home_url( '/?pnbc_return=' . rawurlencode( $reference ) ),
				) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array( 'message' => $response->get_error_message() ), 502 );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code >= 400 ) {
			wp_send_json_error( array( 'message' => $body['error']['message'] ?? 'Gateway error' ), $code );
		}

		wp_send_json_success( array(
			'browser_url' => $body['data']['browser_url'] ?? '',
			'reference'   => $body['data']['reference'] ?? $reference,
		) );
	}
}
