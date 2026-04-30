<?php
/**
 * Settings page under Settings → PayNow Bridge.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class PNBC_Admin {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) self::$instance = new self();
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	public function menu() {
		add_options_page(
			__( 'PayNow Bridge', 'paynow-bridge-connect' ),
			__( 'PayNow Bridge', 'paynow-bridge-connect' ),
			'manage_options',
			'pnbc',
			array( $this, 'render' )
		);
	}

	public function register_settings() {
		register_setting( 'pnbc', 'pnbc_api_key',  array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( 'pnbc', 'pnbc_mode',     array( 'sanitize_callback' => array( $this, 'sanitize_mode' ) ) );
		register_setting( 'pnbc', 'pnbc_api_base', array( 'sanitize_callback' => 'esc_url_raw' ) );
	}

	public function sanitize_mode( $v ) {
		return in_array( $v, array( 'test', 'live' ), true ) ? $v : 'test';
	}

	public function enqueue( $hook ) {
		if ( 'settings_page_pnbc' !== $hook ) return;
		wp_enqueue_style( 'pnbc-admin', PNBC_URL . 'assets/admin.css', array(), PNBC_VERSION );
		wp_enqueue_script( 'pnbc-admin', PNBC_URL . 'assets/admin.js', array( 'jquery' ), PNBC_VERSION, true );
		wp_localize_script( 'pnbc-admin', 'PNBC', array(
			'nonce' => wp_create_nonce( 'pnbc_admin' ),
			'rest'  => esc_url_raw( rest_url( 'pnbc/v1/' ) ),
		) );
	}

	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) return;
		$webhook_url = home_url( '/?pnbc_webhook=1' );
		?>
		<div class="wrap pnbc-wrap">
			<h1><?php esc_html_e( 'PayNow Bridge Connect', 'paynow-bridge-connect' ); ?></h1>
			<p class="description">
				<?php esc_html_e( 'Paste your ManishaPay API key. Need one? Sign up at', 'paynow-bridge-connect' ); ?>
				<a href="https://manishapay.dev" target="_blank">manishapay.dev</a>.
			</p>

			<form action="options.php" method="post">
				<?php settings_fields( 'pnbc' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="pnbc_api_key"><?php esc_html_e( 'API key', 'paynow-bridge-connect' ); ?></label></th>
						<td>
							<input type="password" id="pnbc_api_key" name="pnbc_api_key" value="<?php echo esc_attr( pnbc_opt( 'api_key' ) ); ?>" class="regular-text" autocomplete="off">
							<p class="description">Format: <code>mp_test_…</code> or <code>mp_live_…</code></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="pnbc_mode"><?php esc_html_e( 'Mode', 'paynow-bridge-connect' ); ?></label></th>
						<td>
							<select id="pnbc_mode" name="pnbc_mode">
								<option value="test" <?php selected( pnbc_opt( 'mode' ), 'test' ); ?>>Test</option>
								<option value="live" <?php selected( pnbc_opt( 'mode' ), 'live' ); ?>>Live</option>
							</select>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="pnbc_api_base"><?php esc_html_e( 'Gateway URL', 'paynow-bridge-connect' ); ?></label></th>
						<td>
							<input type="url" id="pnbc_api_base" name="pnbc_api_base" value="<?php echo esc_attr( pnbc_opt( 'api_base', 'https://api.manishapay.dev' ) ); ?>" class="regular-text">
							<p class="description"><?php esc_html_e( 'Override only if self-hosting the gateway.', 'paynow-bridge-connect' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Webhook URL', 'paynow-bridge-connect' ); ?></th>
						<td>
							<code><?php echo esc_html( $webhook_url ); ?></code>
							<p class="description"><?php esc_html_e( 'Add this URL to your ManishaPay project as a webhook destination.', 'paynow-bridge-connect' ); ?></p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<hr>
			<h2><?php esc_html_e( 'Test connection', 'paynow-bridge-connect' ); ?></h2>
			<p>
				<button type="button" class="button button-secondary" id="pnbc-test"><?php esc_html_e( 'Run health check', 'paynow-bridge-connect' ); ?></button>
				<span id="pnbc-test-result" style="margin-left:8px;"></span>
			</p>
		</div>
		<?php
	}
}
