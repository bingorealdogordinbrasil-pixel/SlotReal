const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. CONEXÃO COM MONGODB
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ BANCO DE DADOS CONECTADO!"))
    .catch(err => console.error("❌ ERRO NO BANCO:", err));

// 2. MODELOS DE DADOS
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    fone: String,
    saldo: { type: Number, default: 1.00 } // Bônus Inicial
}));

const Saque = mongoose.model('Saque', new mongoose.Schema({
    user: String,
    chave: String,
    valor: Number,
    status: { type: String, default: '⏳ PENDENTE' },
    data: { type: String, default: () => new Date().toLocaleString('pt-BR') }
}));

// 3. MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

// --- ROTAS DO JOGO ---

// Cadastro com Bônus
app.post('/auth/cadastro', async (req, res) => {
    try {
        const { user, pass, fone } = req.body;
        const novo = new User({ user, pass, fone });
        await novo.save();
        res.json({ success: true, saldo: 1.00 });
    } catch (e) { res.json({ success: false, message: "Usuário já existe!" }); }
});

// Login
app.post('/auth/login', async (req, res) => {
    try {
        const { user, pass } = req.body;
        const conta = await User.findOne({ user, pass });
        if (conta) res.json({ success: true, saldo: conta.saldo });
        else res.json({ success: false, message: "Dados incorretos!" });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Atualizar Saldo (Após rodar o slot)
app.post('/api/save-saldo', async (req, res) => {
    try {
        const { user, saldo } = req.body;
        await User.findOneAndUpdate({ user }, { saldo: saldo });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- SISTEMA DE PAGAMENTO ---

// Gerar PIX (Vinculado ao usuário)
app.post('/gerar-pix', async (req, res) => {
    try {
        const { userLogado, valor } = req.body;
        const result = await payment.create({ body: {
            transaction_amount: parseFloat(valor) || 10.00,
            description: 'Depósito SlotReal',
            payment_method_id: 'pix',
            external_reference: userLogado, // Identifica quem pagou no Webhook
            payer: { email: 'contato@slotreal.com' }
        }});
        res.json({
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code,
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (e) { res.status(500).json(e); }
});

// WEBHOOK (Aviso de Pagamento Confirmado)
app.post('/webhook', async (req, res) => {
    const { action, data } = req.body;
    if (action === "payment.created" || action === "payment.updated") {
        try {
            const response = await payment.get({ id: data.id });
            if (response.status === 'approved' && response.external_reference) {
                const valorAprovado = response.transaction_amount;
                const nomeUsuario = response.external_reference;

                await User.findOneAndUpdate(
                    { user: nomeUsuario }, 
                    { $inc: { saldo: valorAprovado } }
                );
                console.log(`💰 R$ ${valorAprovado} creditados para ${nomeUsuario}`);
            }
        } catch (error) { console.error("Erro Webhook:", error); }
    }
    res.sendStatus(200);
});

// Solicitar Saque
app.post('/api/solicitar-saque', async (req, res) => {
    try {
        const { user, chave, valor } = req.body;
        const novoSaque = new Saque({ user, chave, valor: parseFloat(valor) });
        await novoSaque.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Painel de ADM
app.get('/painel-adm-secreto', async (req, res) => {
    try {
        const saques = await Saque.find().sort({ _id: -1 });
        let linhas = saques.map(s => `<tr><td>${s.data}</td><td>${s.user}</td><td>${s.chave}</td><td>R$ ${s.valor.toFixed(2)}</td><td>${s.status}</td></tr>`).join('');
        res.send(`<h1>Saques Pendentes</h1><table border="1" style="width:100%">${linhas}</table>`);
    } catch (e) { res.send("Erro ao carregar"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
