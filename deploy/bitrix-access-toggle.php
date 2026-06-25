<?php
/**
 * Загрузите в корень сайта Bitrix (рядом с /bitrix/).
 * Пример: https://ваш-сайт.ru/novactiv-access-toggle.php
 *
 * Задайте секрет ниже и тот же в .env.local приложения (BITRIX_TOGGLE_SECRET).
 */
define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
define('BX_NO_ACCELERATOR_RESET', true);

const NOVACTIV_ACCESS_TOKEN = 'ЗАМЕНИТЕ_НА_СЛОЖНЫЙ_СЕКРЕТ';

require $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

use Bitrix\Main\Config\Option;

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['HTTP_X_ACCESS_TOKEN'] ?? '') !== NOVACTIV_ACCESS_TOKEN) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'message' => 'Forbidden']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? 'status';

function novactiv_is_closed(): bool
{
    return Option::get('main', 'site_stopped', 'N') === 'Y'
        || Option::get('main', 'stop_site', 'N') === 'Y';
}

function novactiv_set_closed(bool $closed): void
{
    $value = $closed ? 'Y' : 'N';
    Option::set('main', 'site_stopped', $value);
    Option::set('main', 'stop_site', $value);
    if ($closed) {
        Option::set('main', 'site_stop_reason', 'Доступ временно закрыт. Novactiv Access.');
    }
}

try {
    switch ($action) {
        case 'close':
            novactiv_set_closed(true);
            break;
        case 'open':
            novactiv_set_closed(false);
            break;
        case 'status':
            break;
        default:
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'action: open | close | status']);
            exit;
    }

    $closed = novactiv_is_closed();
    echo json_encode([
        'ok' => true,
        'closed' => $closed,
        'message' => $closed ? 'Вход на сайт закрыт' : 'Вход на сайт открыт',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}
