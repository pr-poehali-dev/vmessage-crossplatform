import requests

def handler(request):
    # 1. Получаем данные, которые пришли из приложения
    data = request.get_json()

    try:
        # 2. Пересылаем эти данные на ваш хостинг SpaceWeb
        # Замените URL на адрес вашего файла handler.php
        url = "https://vh402-fm.sweb.ru/files/public_html/API/index.php"
        
        response = requests.post(url, json=data, timeout=30)
        
        # 3. Возвращаем ответ от SpaceWeb обратно в приложение
        return response.json(), response.status_code
        
    except Exception as e:
        return {"error": f"Ошибка связи со SpaceWeb: {str(e)}"}, 500