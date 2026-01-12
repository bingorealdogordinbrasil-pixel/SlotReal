const express = require('express');
const path = require('path');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Use o token do seu print 1000074503.jpg
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

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
        console.error(error);
        res.status(500).json({ erro: "Erro ao gerar PIX" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
