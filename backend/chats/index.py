async function myRemoteFunction(data) {
  const response = await fetch('https://xn-----spaceweb-xijcy6aq2jtabp1s.ru', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data) // Передаем данные из Poehali на SpaceWeb
  });

  return await response.json(); // Возвращаем результат обратно в интерфейс
}
