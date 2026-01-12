const express = require('express');
const path = require('path');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

let saquesPendentes = []; // Lista na memória (reinicia se o servidor desligar)

// ROTA PARA GERAR PIX (DEPÓSITO)
app.post('/gerar-pix', async (req, res) => {
    try {
        const body = {
            transaction_amount: 10.00,
            description: 'Depósito SlotReal',
            payment_method_id: 'pix',
            payer: { email: 'admin@slotreal.com' }
        };
        const result = await payment.create({ body });
        res.json({
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code,
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (e) { res.status(500).json(e); }
});

// ROTA PARA SOLICITAR SAQUE
app.post('/solicitar-saque', (req, res) => {
    const { chave, valor } = req.body;
    const novoSaque = {
        id: Date.now(),
        chave,
        valor: parseFloat(valor).toFixed(2),
        data: new Date().toLocaleString('pt-BR'),
        pago: false
    };
    saquesPendentes.push(novoSaque);
    res.json({ success: true });
});

// PAINEL DE ADM (SECRETO)
app.get('/painel-adm-secreto', (req, res) => {
    let linhas = saquesPendentes.map(s => `
        <tr style="background: ${s.pago ? '#dff0d8' : '#fff'}; border-bottom: 1px solid #ccc;">
            <td style="padding:10px;">${s.data}</td>
            <td style="padding:10px;"><b>${s.chave}</b></td>
            <td style="padding:10px; color: green;">R$ ${s.valor}</td>
            <td style="padding:10px;">${s.pago ? '✅ PAGO' : '⏳ PENDENTE'}</td>
        </tr>
    `).join('');

    res.send(`
        <html>
        <head><title>ADM - Slot Real</title></head>
        <body style="font-family: sans-serif; padding: 20px; background: #f4f4f4;">
            <h1>💰 Pedidos de Saque</h1>
            <table style="width: 100%; background: white; border-collapse: collapse; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                <thead style="background: #333; color: white;">
                    <tr><th>Data</th><th>Chave PIX</th><th>Valor</th><th>Status</th></tr>
                </thead>
                <tbody>${linhas || '<tr><td colspan="4" style="text-align:center; padding:20px;">Nenhum saque pendente</td></tr>'}</tbody>
            </table>
            <br><button onclick="location.reload()" style="padding:10px; cursor:pointer;">Atualizar Lista</button>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
