<?php
/**
 * Gutenberg block — uses Server-Side Rendering so we don't need a build
 * step. The block just hands its attributes to the existing shortcode
 * renderer, keeping the markup consistent.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class PNBC_Block {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) self::$instance = new self();
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'register' ) );
	}

	public function register() {
		if ( ! function_exists( 'register_block_type' ) ) return;

		register_block_type(
			'pnbc/button',
			array(
				'api_version'     => 3,
				'title'           => __( 'PayNow Bridge Button', 'paynow-bridge-connect' ),
				'category'        => 'widgets',
				'icon'            => 'money-alt',
				'attributes'      => array(
					'amount'      => array( 'type' => 'string', 'default' => '10.00' ),
					'description' => array( 'type' => 'string', 'default' => '' ),
					'label'       => array( 'type' => 'string', 'default' => 'Pay now' ),
				),
				'render_callback' => function ( $atts ) {
					return PNBC_Shortcode::instance()->render( $atts );
				},
			)
		);
	}
}
