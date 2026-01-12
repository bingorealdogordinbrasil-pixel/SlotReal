const express = require('express');
const path = require('path');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());

// 1. Resolve o erro de "file not found" apontando para a pasta certa
app.use(express.static(path.join(__dirname, 'public')));

// 2. LIGA O DINHEIRO REAL (Cole aqui o Access Token do seu print 1000074503.jpg)
const client = new MercadoPagoConfig({ accessToken: 'COLE_AQUI_SEU_ACCESS_TOKEN' });
const payment = new Payment(client);

// 3. ROTA PARA GERAR O PIX DE R$ 5,00
app.post('/gerar-pix', async (req, res) => {
    try {
        const body = {
            transaction_amount: 5.00,
            description: 'Recarga SlotReal',
            payment_method_id: 'pix',
            payer: { email: 'contato@slotreal.com' }
        };

        const result = await payment.create({ body });
        res.json({
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code,
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (error) {
        res.status(500).json(error);
    }
});

app.listen(process.env.PORT || 10000);
