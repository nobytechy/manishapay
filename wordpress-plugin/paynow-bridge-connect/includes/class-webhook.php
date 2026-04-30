<?php
/**
 * Receives webhooks from ManishaPay and stores transactions.
 *
 * Endpoint: GET/POST /?pnbc_webhook=1
 *
 * Why a query var rather than a REST route? It works on every WP host
 * (some block /wp-json/ via mod_security or .htaccess) and it's simpler
 * to give to non-technical users.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class PNBC_Webhook {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) self::$instance = new self();
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'maybe_handle' ), 5 );
		add_action( 'admin_menu', array( $this, 'menu' ) );
	}

	public function maybe_handle() {
		if ( ! isset( $_GET['pnbc_webhook'] ) ) return;

		$raw = file_get_contents( 'php://input' );
		$payload = json_decode( $raw, true );
		$signature = isset( $_SERVER['HTTP_X_MANISHAPAY_SIGNATURE'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_MANISHAPAY_SIGNATURE'] ) )
			: '';

		// Verify signature against the API key (we use the api key as the
		// shared secret here for simplicity — production setups should use
		// a per-endpoint secret configured in the dashboard).
		$expected = hash_hmac( 'sha256', $raw, pnbc_opt( 'api_key' ) );
		$valid    = hash_equals( $expected, $signature );

		// Persist for the admin viewer regardless — flag invalid sigs.
		$this->log( $payload, $valid );

		// Always 200 so the relay doesn't requeue forever.
		status_header( 200 );
		echo $valid ? 'ok' : 'signature mismatch';
		exit;
	}

	private function log( $payload, $valid ) {
		$logs = get_option( 'pnbc_log', array() );
		array_unshift( $logs, array(
			'time'    => current_time( 'mysql' ),
			'payload' => $payload,
			'valid'   => $valid,
		) );
		$logs = array_slice( $logs, 0, 100 ); // keep only the last 100
		update_option( 'pnbc_log', $logs, false );
	}

	public function menu() {
		add_submenu_page(
			'options-general.php',
			__( 'PayNow Bridge Log', 'paynow-bridge-connect' ),
			__( 'PayNow Bridge Log', 'paynow-bridge-connect' ),
			'manage_options',
			'pnbc-log',
			array( $this, 'render_log' )
		);
	}

	public function render_log() {
		$logs = get_option( 'pnbc_log', array() );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Webhook log', 'paynow-bridge-connect' ); ?></h1>
			<?php if ( empty( $logs ) ) : ?>
				<p><?php esc_html_e( 'No webhooks received yet.', 'paynow-bridge-connect' ); ?></p>
			<?php else : ?>
				<table class="widefat striped">
					<thead><tr><th>Time</th><th>Reference</th><th>Status</th><th>Valid</th></tr></thead>
					<tbody>
						<?php foreach ( $logs as $row ) : ?>
							<tr>
								<td><?php echo esc_html( $row['time'] ); ?></td>
								<td><code><?php echo esc_html( $row['payload']['data']['reference'] ?? '—' ); ?></code></td>
								<td><?php echo esc_html( $row['payload']['data']['status'] ?? '—' ); ?></td>
								<td><?php echo $row['valid'] ? '✅' : '⚠️'; ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}
}
