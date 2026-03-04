<?php

/**
 * phpMyAdmin Signon Script
 * Validates a one-time token via the Game Library backend API
 * and automatically logs the user into phpMyAdmin.
 */

// Read token from query parameter
$token = isset($_GET['token']) ? $_GET['token'] : '';

// Validate token format (UUID v4)
if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $token)) {
    http_response_code(403);
    echo 'Ungueltiger Token';
    exit(1);
}

// Validate token via backend API (localhost only)
$apiUrl = 'http://127.0.0.1:3001/api/admin/pma-validate?token=' . urlencode($token);

$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    http_response_code(403);
    echo 'Token nicht gefunden oder bereits verwendet';
    exit(1);
}

$tokenData = json_decode($response, true);

if (!$tokenData || !isset($tokenData['user']) || !isset($tokenData['password'])) {
    http_response_code(403);
    echo 'Ungueltige Token-Daten';
    exit(1);
}

// Set up phpMyAdmin signon session
session_name('SignonSession');
session_start();

$_SESSION['PMA_single_signon_user'] = $tokenData['user'];
$_SESSION['PMA_single_signon_password'] = $tokenData['password'];
$_SESSION['PMA_single_signon_host'] = 'localhost';

session_write_close();

// Redirect to phpMyAdmin
header('Location: /phpmyadmin/index.php');
exit(0);
