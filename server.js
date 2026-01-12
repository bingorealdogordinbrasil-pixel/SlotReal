const express = require('express');
const path = require('path');
const mongoose = require('mongoose'); // Importante para o banco
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. CONEXÃO COM O MONGODB (Usando sua senha A1l9a9n7)
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ BANCO DE DADOS CONECTADO COM SUCESSO!"))
    .catch(err => console.error("❌ ERRO AO CONECTAR BANCO:", err));

// 2. MODELOS DE DADOS (DATABASE)
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    fone: String,
    saldo: { type: Number, default: 1.00 } // R$ 1,00 de Bônus de Boas-Vindas
}));

const Saque = mongoose.model('Saque', new mongoose.Schema({
    user: String,
    chave: String,
    valor: Number,
    status: { type: String, default: '⏳ PENDENTE' },
    data: { type: String, default: () => new Date().toLocaleString('pt-BR') }
}));

// 3. CONFIGURAÇÃO MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

// --- ROTAS DO SISTEMA ---

// CADASTRO REAL
app.post('/auth/cadastro', async (req, res) => {
    try {
        const { user, pass, fone } = req.body;
        const novo = new User({ user, pass, fone });
        await novo.save();
        res.json({ success: true, saldo: 1.00 });
    } catch (e) {
        res.json({ success: false, message: "Este usuário já existe!" });
    }
});

// LOGIN REAL
app.post('/auth/login', async (req, res) => {
    try {
        const { user, pass } = req.body;
        const conta = await User.findOne({ user, pass });
        if (conta) {
            res.json({ success: true, saldo: conta.saldo });
        } else {
            res.json({ success: false, message: "Usuário ou senha incorretos!" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// SALVAR SALDO APÓS JOGADA
app.post('/api/save-saldo', async (req, res) => {
    try {
        const { user, saldo } = req.body;
        await User.findOneAndUpdate({ user }, { saldo: saldo });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// GERAR PIX (DEPÓSITO)
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

// SOLICITAR SAQUE (SALVA NO BANCO)
app.post('/api/solicitar-saque', async (req, res) => {
    try {
        const { user, chave, valor } = req.body;
        const novoSaque = new Saque({ user, chave, valor: parseFloat(valor) });
        await novoSaque.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// PAINEL DE ADM (BUSCA DO BANCO)
app.get('/painel-adm-secreto', async (req, res) => {
    try {
        const saques = await Saque.find().sort({ _id: -1 });
        let linhas = saques.map(s => `
            <tr style="border-bottom: 1px solid #ccc;">
                <td style="padding:10px;">${s.data}</td>
                <td style="padding:10px;">${s.user}</td>
                <td style="padding:10px;"><b>${s.chave}</b></td>
                <td style="padding:10px; color: green;">R$ ${s.valor.toFixed(2)}</td>
                <td style="padding:10px;">${s.status}</td>
            </tr>
        `).join('');

        res.send(`
            <html>
            <body style="font-family: sans-serif; padding: 20px;">
                <h1>💰 Pedidos de Saque (Base de Dados)</h1>
                <table border="1" style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #333; color: white;">
                        <tr><th>Data</th><th>Usuário</th><th>Chave PIX</th><th>Valor</th><th>Status</th></tr>
                    </thead>
                    <tbody>${linhas || '<tr><td colspan="5">Nenhum saque</td></tr>'}</tbody>
                </table>
            </body>
            </html>
        `);
    } catch (e) { res.send("Erro ao carregar painel"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
